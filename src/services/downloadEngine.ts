import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { storage, DownloadItem } from './storage';
import {
  getFileName,
  getFileCategory,
  sanitizeFileName,
  formatFileSize,
} from '../utils/fileUtils';

export type DownloadEventCallback = (download: DownloadItem) => void;
export type DownloadListCallback = (downloads: DownloadItem[]) => void;

export const SAFARI_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function getRefererFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/`;
  } catch {
    return '';
  }
}

function parseContentDispositionFileName(headerValue?: string | null): string | null {
  if (!headerValue) return null;
  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {}
  }
  const match = headerValue.match(/filename=["']?([^"';]+)["']?/i);
  if (match && match[1]) {
    return decodeURIComponent(match[1].trim());
  }
  return null;
}

class DownloadEngine {
  private activeDownloads: Map<string, any> = new Map();
  private downloadQueue: string[] = [];
  private maxConcurrent: number = 3;
  private listeners: Set<DownloadListCallback> = new Set();
  private downloads: DownloadItem[] = [];
  private speedTrackers: Map<string, { lastBytes: number; lastTime: number }> = new Map();

  async initialize(): Promise<void> {
    this.downloads = await storage.getDownloads();
    const settings = await storage.getSettings();
    this.maxConcurrent = settings.maxSimultaneousDownloads;

    // Reset any downloads that were "downloading" when app closed
    this.downloads = this.downloads.map(d => {
      if (d.status === 'downloading') {
        return { ...d, status: 'paused' as const, speed: 0 };
      }
      return d;
    });
    await storage.saveDownloads(this.downloads);
    this.notifyListeners();
  }

  subscribe(callback: DownloadListCallback): () => void {
    this.listeners.add(callback);
    callback(this.downloads);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach(cb => cb([...this.downloads]));
  }

  private updateDownloadState(id: string, updates: Partial<DownloadItem>): void {
    const index = this.downloads.findIndex(d => d.id === id);
    if (index !== -1) {
      this.downloads[index] = { ...this.downloads[index], ...updates };
      this.notifyListeners();
    }
  }

  private getDownloadDir(): string {
    const { dirs } = ReactNativeBlobUtil.fs;
    return Platform.OS === 'ios' ? dirs.DocumentDir : dirs.DownloadDir;
  }

  getActiveCount(): number {
    return this.activeDownloads.size;
  }

  getDownloads(): DownloadItem[] {
    return [...this.downloads];
  }

  getActiveDownloads(): DownloadItem[] {
    return this.downloads.filter(d => d.status === 'downloading');
  }

  getCompletedDownloads(): DownloadItem[] {
    return this.downloads.filter(d => d.status === 'completed');
  }

  getQueuedDownloads(): DownloadItem[] {
    return this.downloads.filter(d => d.status === 'queued');
  }

  async startDownload(
    url: string,
    customFileName?: string,
    headers?: Record<string, string>,
  ): Promise<DownloadItem> {
    const id = `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileName = sanitizeFileName(customFileName || getFileName(url));
    const downloadDir = this.getDownloadDir();
    const filePath = `${downloadDir}/TurboDownloader/${fileName}`;
    const category = getFileCategory(url);

    // Ensure download directory exists
    const dirPath = `${downloadDir}/TurboDownloader`;
    const exists = await ReactNativeBlobUtil.fs.isDir(dirPath);
    if (!exists) {
      await ReactNativeBlobUtil.fs.mkdir(dirPath);
    }

    const download: DownloadItem = {
      id,
      url,
      fileName,
      filePath,
      fileSize: 0,
      downloadedSize: 0,
      speed: 0,
      progress: 0,
      status: 'queued',
      category,
      createdAt: new Date().toISOString(),
      resumable: true,
    };

    this.downloads.unshift(download);
    await storage.saveDownloads(this.downloads);
    this.notifyListeners();

    // Try to start immediately or queue
    if (this.activeDownloads.size < this.maxConcurrent) {
      await this._executeDownload(download, headers);
    } else {
      this.downloadQueue.push(id);
    }

    return download;
  }

  private async _executeDownload(
    download: DownloadItem,
    headers?: Record<string, string>,
  ): Promise<void> {
    const { id, url } = download;
    this.updateDownloadState(id, { status: 'downloading' });
    this.speedTrackers.set(id, { lastBytes: 0, lastTime: Date.now() });

    const settings = await storage.getSettings();
    const configuredThreads = Math.min(Math.max(settings.threadsPerDownload || 8, 2), 12);

    const referer = headers?.['Referer'] || headers?.['referer'] || getRefererFromUrl(url);
    const requestHeaders: Record<string, string> = {
      'User-Agent': SAFARI_USER_AGENT,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive',
      ...(referer ? { 'Referer': referer } : {}),
      ...headers,
    };

    let totalSize = 0;
    let rangeSupported = false;
    let serverFileName: string | null = null;

    // Probe server for range support & file size
    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        headers: requestHeaders,
      });

      const acceptRanges = headResponse.headers.get('accept-ranges');
      const contentLength = headResponse.headers.get('content-length');
      const disposition = headResponse.headers.get('content-disposition');
      serverFileName = parseContentDispositionFileName(disposition);

      if (contentLength) {
        totalSize = parseInt(contentLength, 10);
        this.updateDownloadState(id, { fileSize: totalSize });
      }

      const contentType = headResponse.headers.get('content-type');
      if (contentType) {
        this.updateDownloadState(id, { mimeType: contentType });
      }

      if (serverFileName) {
        this.updateDownloadState(id, { fileName: sanitizeFileName(serverFileName) });
      }

      if (acceptRanges === 'bytes' && totalSize > 2 * 1024 * 1024) {
        rangeSupported = true;
      } else if (totalSize > 3 * 1024 * 1024) {
        // Test range capability with 1 byte range
        try {
          const testRes = await fetch(url, {
            method: 'GET',
            headers: { ...requestHeaders, 'Range': 'bytes=0-1' },
          });
          if (testRes.status === 206) {
            rangeSupported = true;
          }
        } catch {}
      }
    } catch (e) {
      console.log('HEAD request skipped or failed, continuing with direct GET...', e);
    }

    // If server supports HTTP Range and file is > 2MB, run Multi-Threaded Download (Velocity style!)
    if (rangeSupported && totalSize > 2 * 1024 * 1024) {
      console.log(`Starting multi-threaded download for ${download.fileName} with ${configuredThreads} threads!`);
      await this._executeMultiThreadDownload(download, totalSize, configuredThreads, requestHeaders);
    } else {
      console.log(`Starting single-threaded download for ${download.fileName}`);
      await this._executeSingleThreadDownload(download, totalSize, requestHeaders);
    }
  }

  private async _executeMultiThreadDownload(
    download: DownloadItem,
    totalSize: number,
    numThreads: number,
    requestHeaders: Record<string, string>,
  ): Promise<void> {
    const { id, url, filePath } = download;
    const downloadDir = this.getDownloadDir();
    const tempPrefix = `${downloadDir}/TurboDownloader/.${id}_part_`;

    const chunkSize = Math.floor(totalSize / numThreads);
    const partPaths: string[] = [];
    const partBytes: number[] = new Array(numThreads).fill(0);
    const tasks: any[] = [];
    let isCancelled = false;

    const cancelAll = () => {
      isCancelled = true;
      tasks.forEach(t => {
        try { t.cancel(); } catch (e) {}
      });
    };

    this.activeDownloads.set(id, { cancel: cancelAll });
    this.speedTrackers.set(id, { lastBytes: 0, lastTime: Date.now() });

    try {
      const promises = [];

      for (let i = 0; i < numThreads; i++) {
        const start = i * chunkSize;
        const end = (i === numThreads - 1) ? totalSize - 1 : (i + 1) * chunkSize - 1;
        const partPath = `${tempPrefix}${i}`;
        partPaths.push(partPath);

        const config = {
          fileCache: true,
          path: partPath,
          followRedirect: true,
          IOSBackgroundTask: true,
          overwrite: true,
        };

        const partHeaders = {
          ...requestHeaders,
          'Range': `bytes=${start}-${end}`,
        };

        const task = ReactNativeBlobUtil.config(config)
          .fetch('GET', url, partHeaders)
          .progress({ count: 10, interval: 200 }, (received: number) => {
            if (isCancelled) return;
            partBytes[i] = received;
            const currentTotal = partBytes.reduce((a, b) => a + b, 0);

            const now = Date.now();
            const tracker = this.speedTrackers.get(id);
            let speed = 0;
            if (tracker) {
              const timeDiff = (now - tracker.lastTime) / 1000;
              const bytesDiff = currentTotal - tracker.lastBytes;
              if (timeDiff > 0) speed = bytesDiff / timeDiff;
              this.speedTrackers.set(id, { lastBytes: currentTotal, lastTime: now });
            }

            this.updateDownloadState(id, {
              downloadedSize: currentTotal,
              fileSize: totalSize,
              progress: Math.min(currentTotal / totalSize, 1),
              speed,
            });
          });

        tasks.push(task);
        promises.push(task);
      }

      const results = await Promise.all(promises);

      // Verify each part completed with valid HTTP status
      for (const res of results) {
        const info = res.info();
        if (info.status >= 400) {
          throw new Error(`Part download failed with HTTP ${info.status}`);
        }
      }

      // Concatenate parts natively using 'uri' encoding (zero JS memory overhead!)
      await ReactNativeBlobUtil.fs.cp(partPaths[0], filePath);
      await ReactNativeBlobUtil.fs.unlink(partPaths[0]);

      for (let i = 1; i < numThreads; i++) {
        await ReactNativeBlobUtil.fs.appendFile(filePath, partPaths[i], 'uri');
        await ReactNativeBlobUtil.fs.unlink(partPaths[i]);
      }

      const stat = await ReactNativeBlobUtil.fs.stat(filePath);
      const finalBytes = Number(stat.size);

      this.updateDownloadState(id, {
        status: 'completed',
        progress: 1,
        speed: 0,
        downloadedSize: finalBytes,
        fileSize: finalBytes,
        filePath,
        completedAt: new Date().toISOString(),
      });

      this.activeDownloads.delete(id);
      this.speedTrackers.delete(id);
      await this._persistState();
      this._processQueue();

    } catch (err: any) {
      // Clean up temporary parts
      for (const p of partPaths) {
        try {
          const ex = await ReactNativeBlobUtil.fs.exists(p);
          if (ex) await ReactNativeBlobUtil.fs.unlink(p);
        } catch (e) {}
      }

      if (isCancelled || err.message?.includes('cancel') || err.message?.includes('abort')) {
        return;
      }

      console.warn('Multi-part download error, falling back to single stream:', err.message);
      await this._executeSingleThreadDownload(download, totalSize, requestHeaders);
    }
  }

  private async _executeSingleThreadDownload(
    download: DownloadItem,
    knownTotalSize: number,
    requestHeaders: Record<string, string>,
  ): Promise<void> {
    const { id, url, filePath } = download;
    const downloadDir = this.getDownloadDir();

    try {
      const config: any = {
        fileCache: true,
        path: filePath,
        followRedirect: true,
        IOSBackgroundTask: true,
        indicator: true,
        overwrite: true,
      };

      if (Platform.OS === 'ios') {
        config.IOSBackgroundTask = true;
      }

      const task = ReactNativeBlobUtil.config(config)
        .fetch('GET', url, requestHeaders)
        .progress({ count: 10, interval: 200 }, (received: number, total: number) => {
          const now = Date.now();
          const tracker = this.speedTrackers.get(id);

          let speed = 0;
          if (tracker) {
            const timeDiff = (now - tracker.lastTime) / 1000;
            const bytesDiff = received - tracker.lastBytes;
            if (timeDiff > 0) {
              speed = bytesDiff / timeDiff;
            }
            this.speedTrackers.set(id, { lastBytes: received, lastTime: now });
          }

          const actualTotal = total > 0 ? total : knownTotalSize;
          const progress = actualTotal > 0 ? received / actualTotal : 0;

          this.updateDownloadState(id, {
            downloadedSize: received,
            fileSize: actualTotal,
            progress: Math.min(progress, 1),
            speed,
          });
        });

      this.activeDownloads.set(id, task);

      const result = await task;
      const info = result.info();
      const httpStatus = info.status;

      // 1. Verify HTTP Status Code
      if (httpStatus >= 400) {
        try {
          await ReactNativeBlobUtil.fs.unlink(result.path());
        } catch (e) {}

        let msg = `Server error HTTP ${httpStatus}`;
        if (httpStatus === 403) msg = '403 Forbidden: Download link expired or blocked by anti-bot. Please generate a fresh link in the built-in browser.';
        if (httpStatus === 404) msg = '404 Not Found: The file was not found on the download server.';
        if (httpStatus === 401) msg = '401 Unauthorized: This download link requires a login session.';
        throw new Error(msg);
      }

      // 2. Verify downloaded file on disk
      const stat = await ReactNativeBlobUtil.fs.stat(result.path());
      const downloadedBytes = Number(stat.size);

      // 3. Detect HTML error/captcha traps (e.g. 146-byte error bodies)
      if (downloadedBytes < 4096) {
        try {
          const content = await ReactNativeBlobUtil.fs.readFile(result.path(), 'utf8');
          const lower = content.toLowerCase();
          if (
            lower.includes('<!doctype html') ||
            lower.includes('<html') ||
            lower.includes('<title>403') ||
            lower.includes('cloudflare') ||
            lower.includes('access denied') ||
            lower.includes('checking your browser')
          ) {
            try {
              await ReactNativeBlobUtil.fs.unlink(result.path());
            } catch (e) {}

            throw new Error(
              'The download link returned a webpage instead of the file (likely an expired or Cloudflare-protected link). Please open the movie website in the built-in browser to start the direct download.'
            );
          }
        } catch (readErr: any) {
          if (readErr.message?.includes('webpage instead of the file')) {
            throw readErr;
          }
        }
      }

      // 4. Check Content-Disposition for server-provided filename
      let finalPath = result.path();
      let finalName = download.fileName;
      const respHeaders = info.headers || {};
      const cd = respHeaders['content-disposition'] || respHeaders['Content-Disposition'];
      const serverFileName = parseContentDispositionFileName(cd);
      if (serverFileName) {
        const sanitized = sanitizeFileName(serverFileName);
        const newPath = `${downloadDir}/TurboDownloader/${sanitized}`;
        try {
          await ReactNativeBlobUtil.fs.mv(result.path(), newPath);
          finalPath = newPath;
          finalName = sanitized;
        } catch (e) {}
      }

      this.updateDownloadState(id, {
        status: 'completed',
        progress: 1,
        speed: 0,
        fileName: finalName,
        downloadedSize: downloadedBytes,
        fileSize: downloadedBytes,
        filePath: finalPath,
        completedAt: new Date().toISOString(),
      });

      this.activeDownloads.delete(id);
      this.speedTrackers.delete(id);
      await this._persistState();
      this._processQueue();

    } catch (error: any) {
      if (error.message?.includes('cancel') || error.message?.includes('abort')) {
        return;
      }

      console.error('Download failed:', error);
      this.updateDownloadState(id, {
        status: 'failed',
        speed: 0,
        error: error.message || 'Download failed',
      });

      this.activeDownloads.delete(id);
      this.speedTrackers.delete(id);
      await this._persistState();
      this._processQueue();
    }
  }

  async pauseDownload(id: string): Promise<void> {
    const task = this.activeDownloads.get(id);
    if (task) {
      try {
        task.cancel();
      } catch (e) {
        // Task may already be done
      }
      this.activeDownloads.delete(id);
      this.speedTrackers.delete(id);
    }

    this.updateDownloadState(id, {
      status: 'paused',
      speed: 0,
    });

    await this._persistState();
    this._processQueue();
  }

  async resumeDownload(id: string): Promise<void> {
    const download = this.downloads.find(d => d.id === id);
    if (!download) return;

    if (download.status === 'paused' || download.status === 'failed') {
      if (this.activeDownloads.size < this.maxConcurrent) {
        // Re-start the download (RN doesn't easily support true resume with byte ranges)
        this.updateDownloadState(id, { status: 'queued', error: undefined });
        await this._executeDownload(download);
      } else {
        this.downloadQueue.push(id);
        this.updateDownloadState(id, { status: 'queued', error: undefined });
      }
    }
  }

  async cancelDownload(id: string): Promise<void> {
    const task = this.activeDownloads.get(id);
    if (task) {
      try {
        task.cancel();
      } catch (e) {}
      this.activeDownloads.delete(id);
      this.speedTrackers.delete(id);
    }

    // Remove from queue
    this.downloadQueue = this.downloadQueue.filter(qId => qId !== id);

    this.updateDownloadState(id, {
      status: 'cancelled',
      speed: 0,
    });

    // Try to clean up the file
    const download = this.downloads.find(d => d.id === id);
    if (download?.filePath) {
      try {
        const exists = await ReactNativeBlobUtil.fs.exists(download.filePath);
        if (exists) {
          await ReactNativeBlobUtil.fs.unlink(download.filePath);
        }
      } catch (e) {}
    }

    await this._persistState();
    this._processQueue();
  }

  async retryDownload(id: string): Promise<void> {
    await this.resumeDownload(id);
  }

  async deleteDownload(id: string, deleteFile: boolean = false): Promise<void> {
    await this.cancelDownload(id);

    if (deleteFile) {
      const download = this.downloads.find(d => d.id === id);
      if (download?.filePath) {
        try {
          const exists = await ReactNativeBlobUtil.fs.exists(download.filePath);
          if (exists) {
            await ReactNativeBlobUtil.fs.unlink(download.filePath);
          }
        } catch (e) {}
      }
    }

    this.downloads = this.downloads.filter(d => d.id !== id);
    await storage.saveDownloads(this.downloads);
    this.notifyListeners();
  }

  async clearCompletedDownloads(): Promise<void> {
    this.downloads = this.downloads.filter(d => d.status !== 'completed');
    await storage.saveDownloads(this.downloads);
    this.notifyListeners();
  }

  async pauseAll(): Promise<void> {
    const activeIds = [...this.activeDownloads.keys()];
    for (const id of activeIds) {
      await this.pauseDownload(id);
    }
    this.downloadQueue = [];
  }

  async resumeAll(): Promise<void> {
    const paused = this.downloads.filter(d => d.status === 'paused');
    for (const download of paused) {
      await this.resumeDownload(download.id);
    }
  }

  private async _processQueue(): Promise<void> {
    while (this.activeDownloads.size < this.maxConcurrent && this.downloadQueue.length > 0) {
      const nextId = this.downloadQueue.shift();
      if (nextId) {
        const download = this.downloads.find(d => d.id === nextId);
        if (download && download.status === 'queued') {
          await this._executeDownload(download);
        }
      }
    }
  }

  private async _persistState(): Promise<void> {
    await storage.saveDownloads(this.downloads);
  }

  // Get total download speed
  getTotalSpeed(): number {
    return this.downloads
      .filter(d => d.status === 'downloading')
      .reduce((sum, d) => sum + d.speed, 0);
  }

  updateMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
    this._processQueue();
  }
}

export const downloadEngine = new DownloadEngine();

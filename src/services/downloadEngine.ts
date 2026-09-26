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
    const { id, url, filePath } = download;
    this.updateDownloadState(id, { status: 'downloading' });

    // Initialize speed tracker
    this.speedTrackers.set(id, { lastBytes: 0, lastTime: Date.now() });

    try {
      const referer = headers?.['Referer'] || headers?.['referer'] || getRefererFromUrl(url);
      const requestHeaders: Record<string, string> = {
        'User-Agent': SAFARI_USER_AGENT,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        ...(referer ? { 'Referer': referer } : {}),
        ...headers,
      };

      // First, try to get file size & metadata with a HEAD request
      let totalSize = 0;
      try {
        const headResponse = await fetch(url, {
          method: 'HEAD',
          headers: requestHeaders,
        });
        const contentLength = headResponse.headers.get('content-length');
        if (contentLength) {
          totalSize = parseInt(contentLength, 10);
          this.updateDownloadState(id, { fileSize: totalSize });
        }
        const contentType = headResponse.headers.get('content-type');
        if (contentType) {
          this.updateDownloadState(id, { mimeType: contentType });
        }
        const disposition = headResponse.headers.get('content-disposition');
        const dispositionName = parseContentDispositionFileName(disposition);
        if (dispositionName) {
          this.updateDownloadState(id, { fileName: sanitizeFileName(dispositionName) });
        }
      } catch (e) {
        console.log('HEAD request skipped or failed, continuing with direct GET...', e);
      }

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

          const actualTotal = total > 0 ? total : totalSize;
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
        const downloadDir = this.getDownloadDir();
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
      // Check if it was cancelled
      if (error.message?.includes('cancel') || error.message?.includes('abort')) {
        // Already handled by cancelDownload
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

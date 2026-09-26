import { Platform } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { storage, DownloadItem } from './storage';
import {
  getFileName,
  getFileCategory,
  sanitizeFileName,
  formatFileSize,
  normalizeUrl,
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

interface SpeedTracker {
  lastBytes: number;
  lastTime: number;
  smoothedSpeed: number;
  lastNotifyTime: number;
}

class DownloadEngine {
  private activeDownloads: Map<string, any> = new Map();
  private downloadQueue: string[] = [];
  private maxConcurrent: number = 3;
  private listeners: Set<DownloadListCallback> = new Set();
  private downloads: DownloadItem[] = [];
  private speedTrackers: Map<string, SpeedTracker> = new Map();

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
    const safeUrl = normalizeUrl(url);
    const id = `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileName = sanitizeFileName(customFileName || getFileName(safeUrl));
    const downloadDir = this.getDownloadDir();
    const filePath = `${downloadDir}/TurboDownloader/${fileName}`;
    const category = getFileCategory(safeUrl);

    // Ensure download directory exists
    const dirPath = `${downloadDir}/TurboDownloader`;
    try {
      const exists = await ReactNativeBlobUtil.fs.exists(dirPath);
      if (!exists) {
        await ReactNativeBlobUtil.fs.mkdir(dirPath);
      }
    } catch {}

    const download: DownloadItem = {
      id,
      url: safeUrl,
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
      this._executeDownload(download, headers).catch(err => {
        console.error('Download execution error:', err);
      });
    } else {
      this.downloadQueue.push(id);
    }

    return download;
  }

  private async _executeDownload(
    download: DownloadItem,
    headers?: Record<string, string>,
  ): Promise<void> {
    const { id } = download;
    const url = normalizeUrl(download.url);
    this.updateDownloadState(id, { status: 'downloading', url });
    this.speedTrackers.set(id, { lastBytes: download.downloadedSize || 0, lastTime: Date.now(), smoothedSpeed: 0, lastNotifyTime: 0 });

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

    const downloadDir = this.getDownloadDir();
    const currentFilePath = `${downloadDir}/TurboDownloader/${download.fileName}`;
    const tempPrefix = `${downloadDir}/TurboDownloader/.${id}_part_`;
    const singlePartPath = `${currentFilePath}.part`;

    // Ensure download.filePath is updated to current container
    if (download.filePath !== currentFilePath) {
      download.filePath = currentFilePath;
      this.updateDownloadState(id, { filePath: currentFilePath });
    }

    // 1. Strict Resume Check: If partial files exist on disk or download was previously in-progress
    let hasExistingMultiParts = false;
    for (let i = 0; i < 16; i++) {
      try {
        if (await ReactNativeBlobUtil.fs.exists(`${tempPrefix}${i}`)) {
          hasExistingMultiParts = true;
          break;
        }
      } catch {}
    }

    let hasExistingSinglePart = false;
    try {
      hasExistingSinglePart = await ReactNativeBlobUtil.fs.exists(singlePartPath);
    } catch {}

    const isResume = (download.downloadedSize || 0) > 0 || hasExistingMultiParts || hasExistingSinglePart;
    let totalSize = download.fileSize || 0;

    // If existing multi-thread chunks exist OR marked as multi-thread on resume:
    if (hasExistingMultiParts || (download.isMultiThread && isResume)) {
      console.log(`Resuming multi-threaded download for ${download.fileName} from existing chunks`);
      const threadsToUse = download.threads || configuredThreads;
      this.updateDownloadState(id, { threads: threadsToUse, isMultiThread: true });
      await this._executeMultiThreadDownload(download, totalSize, threadsToUse, requestHeaders);
      return;
    }

    // If existing single-stream part file exists OR marked as single-thread on resume:
    if (hasExistingSinglePart || (!download.isMultiThread && isResume && totalSize > 0)) {
      console.log(`Resuming single-threaded download for ${download.fileName} from existing .part`);
      await this._executeSingleThreadDownload(download, totalSize, requestHeaders);
      return;
    }

    // 2. Fresh download: probe to check size and Range support
    let rangeSupported = (download.isMultiThread ?? false) || totalSize > 2 * 1024 * 1024;
    let serverFileName: string | null = null;

    if (totalSize <= 0) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const probeRes = await fetch(url, {
          method: 'GET',
          headers: {
            ...requestHeaders,
            'Range': 'bytes=0-1',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        const status = probeRes.status;
        const contentRange = probeRes.headers.get('content-range');
        const contentLength = probeRes.headers.get('content-length');
        const disposition = probeRes.headers.get('content-disposition');
        const contentType = probeRes.headers.get('content-type');
        serverFileName = parseContentDispositionFileName(disposition);

        if (status === 206 && contentRange) {
          rangeSupported = true;
          const match = contentRange.match(/\/(\d+)/);
          if (match && match[1]) {
            totalSize = parseInt(match[1], 10);
          }
        } else if (contentLength) {
          totalSize = parseInt(contentLength, 10);
          if (totalSize > 2 * 1024 * 1024 || probeRes.headers.get('accept-ranges') === 'bytes') {
            rangeSupported = true;
          }
        }

        if (contentType) {
          this.updateDownloadState(id, { mimeType: contentType });
        }

        if (serverFileName) {
          this.updateDownloadState(id, { fileName: sanitizeFileName(serverFileName) });
        }

        if (totalSize > 0) {
          this.updateDownloadState(id, {
            fileSize: totalSize,
            isMultiThread: rangeSupported,
            threads: configuredThreads,
          });
          await this._persistState();
        }
      } catch (err: any) {
        console.log('Probe finished with notice:', err.message);
      }
    }

    const threadsToUse = download.threads || configuredThreads;

    // Run Multi-Threaded Download if range supported & size > 2MB
    if (rangeSupported && totalSize > 2 * 1024 * 1024) {
      this.updateDownloadState(id, { threads: threadsToUse, isMultiThread: true });
      await this._executeMultiThreadDownload(download, totalSize, threadsToUse, requestHeaders);
    } else {
      await this._executeSingleThreadDownload(download, totalSize, requestHeaders);
    }
  }

  private async _executeMultiThreadDownload(
    download: DownloadItem,
    totalSize: number,
    numThreads: number,
    requestHeaders: Record<string, string>,
  ): Promise<void> {
    const { id, url } = download;
    const downloadDir = this.getDownloadDir();
    const filePath = `${downloadDir}/TurboDownloader/${download.fileName}`;
    const tempPrefix = `${downloadDir}/TurboDownloader/.${id}_part_`;

    const chunkSize = Math.floor(totalSize / numThreads);
    const partPaths: string[] = [];
    const partBytes: number[] = new Array(numThreads).fill(0);
    const tasks: any[] = [];
    let isCancelled = false;

    const cancelAll = (isPaused = false) => {
      isCancelled = true;
      tasks.forEach(t => {
        try { t.cancel(); } catch (e) {}
      });
    };

    this.activeDownloads.set(id, { cancel: cancelAll });

    const handleProgressTick = () => {
      const currentTotal = partBytes.reduce((a, b) => a + b, 0);
      const now = Date.now();
      let tracker = this.speedTrackers.get(id);
      if (!tracker) {
        tracker = { lastBytes: currentTotal, lastTime: now, smoothedSpeed: 0, lastNotifyTime: 0 };
        this.speedTrackers.set(id, tracker);
      }

      // Sample speed at stable intervals (>= 300ms) to avoid violent micro-oscillations
      const timeDiff = (now - tracker.lastTime) / 1000;
      if (timeDiff >= 0.3) {
        const bytesDiff = currentTotal - tracker.lastBytes;
        if (bytesDiff >= 0) {
          const instantSpeed = bytesDiff / timeDiff;
          tracker.smoothedSpeed = tracker.smoothedSpeed > 0
            ? (tracker.smoothedSpeed * 0.6 + instantSpeed * 0.4)
            : instantSpeed;
        }
        tracker.lastBytes = currentTotal;
        tracker.lastTime = now;
      }

      const cleanSpeed = (isFinite(tracker.smoothedSpeed) && tracker.smoothedSpeed > 0)
        ? Math.round(tracker.smoothedSpeed)
        : 0;

      const safeTotal = totalSize > 0 ? totalSize : 0;
      const safeProgress = safeTotal > 0 ? Math.min(1, Math.max(0, currentTotal / safeTotal)) : 0;

      // Throttle state updates to keep UI responsive and smooth at 60fps
      if (now - tracker.lastNotifyTime >= 250 || safeProgress >= 1) {
        tracker.lastNotifyTime = now;
        this.updateDownloadState(id, {
          downloadedSize: currentTotal,
          fileSize: safeTotal,
          progress: safeProgress,
          speed: cleanSpeed,
        });
      }
    };

    try {
      const promises = [];

      for (let i = 0; i < numThreads; i++) {
        const start = i * chunkSize;
        const end = (i === numThreads - 1) ? totalSize - 1 : (i + 1) * chunkSize - 1;
        const partLength = end - start + 1;
        const partPath = `${tempPrefix}${i}`;
        partPaths.push(partPath);

        // Check if part file already exists and has bytes from a previously paused run
        let existingPartBytes = 0;
        try {
          if (await ReactNativeBlobUtil.fs.exists(partPath)) {
            const stat = await ReactNativeBlobUtil.fs.stat(partPath);
            existingPartBytes = Number(stat.size);
          }
        } catch {}

        if (existingPartBytes >= partLength) {
          // This part is ALREADY 100% completed!
          partBytes[i] = partLength;
          continue;
        }

        const isResumingPart = existingPartBytes > 0;
        partBytes[i] = existingPartBytes;
        const partStart = start + existingPartBytes;

        const config = {
          fileCache: true,
          path: partPath,
          followRedirect: true,
          IOSBackgroundTask: true,
          overwrite: !isResumingPart, // overwrite: false enables native iOS [NSOutputStream initToFileAtPath:partPath append:YES]!
        };

        const partHeaders = {
          ...requestHeaders,
          'Range': `bytes=${partStart}-${end}`,
        };

        const task = ReactNativeBlobUtil.config(config)
          .fetch('GET', url, partHeaders)
          .progress({ count: 10, interval: 250 }, (received: any) => {
            if (isCancelled) return;
            const bytesNum = typeof received === 'string' ? parseInt(received, 10) || 0 : Math.max(0, received || 0);
            partBytes[i] = existingPartBytes + bytesNum;
            handleProgressTick();
          });

        tasks.push(task);
        promises.push(task);
      }

      // Initial progress update right upon starting/resuming
      handleProgressTick();

      const results = await Promise.all(promises);

      // Verify each part completed with valid HTTP status
      for (const res of results) {
        const info = res.info();
        if (info.status >= 400) {
          throw new Error(`Part download failed with HTTP ${info.status}`);
        }
      }

      // Clean existing target file if any
      try {
        if (await ReactNativeBlobUtil.fs.exists(filePath)) {
          await ReactNativeBlobUtil.fs.unlink(filePath);
        }
      } catch (e) {}

      // Concatenate parts natively using 'uri' encoding (zero JS memory overhead!)
      await ReactNativeBlobUtil.fs.cp(partPaths[0], filePath);
      try { await ReactNativeBlobUtil.fs.unlink(partPaths[0]); } catch (e) {}

      for (let i = 1; i < numThreads; i++) {
        if (await ReactNativeBlobUtil.fs.exists(partPaths[i])) {
          await ReactNativeBlobUtil.fs.appendFile(filePath, partPaths[i], 'uri');
          try { await ReactNativeBlobUtil.fs.unlink(partPaths[i]); } catch (e) {}
        }
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
      if (isCancelled || err.message?.includes('cancel') || err.message?.includes('abort') || err.message?.includes('canceled')) {
        // User PAUSED the download: KEEP all chunk files safe on disk so resume continues seamlessly!
        return;
      }

      console.warn('Multi-part download interrupted:', err.message);
      // DO NOT delete parts if network dropped! Keep parts so resume picks them up!
      this.updateDownloadState(id, {
        status: 'failed',
        speed: 0,
        error: err.message || 'Download interrupted. Tap retry to resume.',
      });
      this.activeDownloads.delete(id);
      this.speedTrackers.delete(id);
      await this._persistState();
      this._processQueue();
    }
  }

  private async _executeSingleThreadDownload(
    download: DownloadItem,
    knownTotalSize: number,
    requestHeaders: Record<string, string>,
  ): Promise<void> {
    const { id, url } = download;
    const downloadDir = this.getDownloadDir();
    const filePath = `${downloadDir}/TurboDownloader/${download.fileName}`;
    const tempPartPath = `${filePath}.part`;
    let isCancelled = false;

    try {
      // Check if partial download already exists on disk
      let existingBytes = 0;
      try {
        if (await ReactNativeBlobUtil.fs.exists(tempPartPath)) {
          const stat = await ReactNativeBlobUtil.fs.stat(tempPartPath);
          existingBytes = Number(stat.size);
        }
      } catch {}

      const isResuming = existingBytes > 0;
      const fetchHeaders = { ...requestHeaders };

      if (isResuming) {
        fetchHeaders['Range'] = `bytes=${existingBytes}-`;
      }

      const config: any = {
        fileCache: true,
        path: tempPartPath,
        followRedirect: true,
        IOSBackgroundTask: true,
        indicator: true,
        overwrite: !isResuming, // append directly to tempPartPath when resuming!
      };

      if (isResuming && knownTotalSize > 0) {
        this.updateDownloadState(id, {
          downloadedSize: existingBytes,
          fileSize: knownTotalSize,
          progress: Math.min(1, existingBytes / knownTotalSize),
          status: 'downloading',
        });
      }

      const task = ReactNativeBlobUtil.config(config)
        .fetch('GET', url, fetchHeaders)
        .progress({ count: 10, interval: 250 }, (received: any, total: any) => {
          if (isCancelled) return;
          const bytesNum = typeof received === 'string' ? parseInt(received, 10) || 0 : Math.max(0, received || 0);
          const totalNum = typeof total === 'string' ? parseInt(total, 10) || 0 : (total || 0);
          const currentReceived = existingBytes + bytesNum;
          const actualTotal = (isFinite(totalNum) && totalNum > 0)
            ? (isResuming ? existingBytes + totalNum : totalNum)
            : (knownTotalSize > 0 ? knownTotalSize : 0);

          const now = Date.now();
          let tracker = this.speedTrackers.get(id);
          if (!tracker) {
            tracker = { lastBytes: currentReceived, lastTime: now, smoothedSpeed: 0, lastNotifyTime: 0 };
            this.speedTrackers.set(id, tracker);
          }

          const timeDiff = (now - tracker.lastTime) / 1000;
          if (timeDiff >= 0.3) {
            const bytesDiff = currentReceived - tracker.lastBytes;
            if (bytesDiff >= 0) {
              const instantSpeed = bytesDiff / timeDiff;
              tracker.smoothedSpeed = tracker.smoothedSpeed > 0
                ? (tracker.smoothedSpeed * 0.6 + instantSpeed * 0.4)
                : instantSpeed;
            }
            tracker.lastBytes = currentReceived;
            tracker.lastTime = now;
          }

          const cleanSpeed = (isFinite(tracker.smoothedSpeed) && tracker.smoothedSpeed > 0)
            ? Math.round(tracker.smoothedSpeed)
            : 0;

          const safeProgress = actualTotal > 0 ? Math.min(1, Math.max(0, currentReceived / actualTotal)) : 0;

          if (now - tracker.lastNotifyTime >= 250 || safeProgress >= 1) {
            tracker.lastNotifyTime = now;
            this.updateDownloadState(id, {
              downloadedSize: currentReceived,
              fileSize: actualTotal,
              progress: safeProgress,
              speed: cleanSpeed,
            });
          }
        });

      this.activeDownloads.set(id, {
        cancel: () => {
          isCancelled = true;
          try { task.cancel(); } catch (e) {}
        },
      });

      const result = await task;
      const info = result.info();
      const httpStatus = info.status;

      // 1. Verify HTTP Status Code
      if (httpStatus >= 400) {
        let msg = `Server error HTTP ${httpStatus}`;
        if (httpStatus === 403) msg = '403 Forbidden: Download link expired or blocked by anti-bot. Please generate a fresh link in the built-in browser.';
        if (httpStatus === 404) msg = '404 Not Found: The file was not found on the download server.';
        if (httpStatus === 401) msg = '401 Unauthorized: This download link requires a login session.';
        throw new Error(msg);
      }

      // Rename final part to complete target path
      try {
        if (await ReactNativeBlobUtil.fs.exists(filePath)) {
          await ReactNativeBlobUtil.fs.unlink(filePath);
        }
      } catch (e) {}

      await ReactNativeBlobUtil.fs.mv(tempPartPath, filePath);

      const stat = await ReactNativeBlobUtil.fs.stat(filePath);
      const downloadedBytes = Number(stat.size);

      // Detect HTML error/captcha traps (e.g. 146-byte error bodies)
      if (downloadedBytes < 4096) {
        try {
          const content = await ReactNativeBlobUtil.fs.readFile(filePath, 'utf8');
          const lower = content.toLowerCase();
          if (
            lower.includes('<!doctype html') ||
            lower.includes('<html') ||
            lower.includes('<title>403') ||
            lower.includes('cloudflare') ||
            lower.includes('access denied') ||
            lower.includes('checking your browser')
          ) {
            try { await ReactNativeBlobUtil.fs.unlink(filePath); } catch (e) {}

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

      // Check Content-Disposition for server-provided filename
      let finalPath = filePath;
      let finalName = download.fileName;
      const respHeaders = info.headers || {};
      const cd = respHeaders['content-disposition'] || respHeaders['Content-Disposition'];
      const serverFileName = parseContentDispositionFileName(cd);
      if (serverFileName) {
        const sanitized = sanitizeFileName(serverFileName);
        const newPath = `${downloadDir}/TurboDownloader/${sanitized}`;
        try {
          await ReactNativeBlobUtil.fs.mv(filePath, newPath);
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
      if (isCancelled || error.message?.includes('cancel') || error.message?.includes('abort') || error.message?.includes('canceled')) {
        // Paused by user! KEEP tempPartPath on disk so resume continues from existing bytes!
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
    const active = this.activeDownloads.get(id);
    if (active) {
      try {
        if (typeof active.cancel === 'function') {
          active.cancel(true);
        }
      } catch (e) {}
      this.activeDownloads.delete(id);
      this.speedTrackers.delete(id);
    }

    // Measure exact bytes on disk from all parts
    const download = this.downloads.find(d => d.id === id);
    if (download) {
      const downloadDir = this.getDownloadDir();
      const tempPrefix = `${downloadDir}/TurboDownloader/.${id}_part_`;
      let totalBytesOnDisk = 0;
      for (let i = 0; i < 16; i++) {
        try {
          const p = `${tempPrefix}${i}`;
          if (await ReactNativeBlobUtil.fs.exists(p)) {
            const stat = await ReactNativeBlobUtil.fs.stat(p);
            totalBytesOnDisk += Number(stat.size);
          }
        } catch {}
      }

      if (totalBytesOnDisk === 0) {
        try {
          const currentSinglePart = `${downloadDir}/TurboDownloader/${download.fileName}.part`;
          if (await ReactNativeBlobUtil.fs.exists(currentSinglePart)) {
            const stat = await ReactNativeBlobUtil.fs.stat(currentSinglePart);
            totalBytesOnDisk = Number(stat.size);
          } else if (download.filePath) {
            const tp = `${download.filePath}.part`;
            if (await ReactNativeBlobUtil.fs.exists(tp)) {
              const stat = await ReactNativeBlobUtil.fs.stat(tp);
              totalBytesOnDisk = Number(stat.size);
            }
          }
        } catch {}
      }

      const finalDownloaded = Math.max(download.downloadedSize || 0, totalBytesOnDisk);
      const safeTotal = download.fileSize || 0;
      const progress = safeTotal > 0 ? Math.min(1, finalDownloaded / safeTotal) : 0;

      this.updateDownloadState(id, {
        status: 'paused',
        downloadedSize: finalDownloaded,
        progress,
        speed: 0,
      });
    } else {
      this.updateDownloadState(id, {
        status: 'paused',
        speed: 0,
      });
    }

    await this._persistState();
    this._processQueue();
  }

  async resumeDownload(id: string): Promise<void> {
    const download = this.downloads.find(d => d.id === id);
    if (!download) return;

    if (download.status === 'paused' || download.status === 'failed') {
      this.updateDownloadState(id, { status: 'queued', error: undefined });
      if (this.activeDownloads.size < this.maxConcurrent) {
        this._executeDownload(download).catch(err => {
          console.error('Resume download execution error:', err);
        });
      } else {
        this.downloadQueue.push(id);
      }
    }
  }

  async cancelDownload(id: string): Promise<void> {
    const active = this.activeDownloads.get(id);
    if (active) {
      try {
        if (typeof active.cancel === 'function') {
          active.cancel();
        }
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

    // Clean up any temporary part files from multi-thread
    const downloadDir = this.getDownloadDir();
    const tempPrefix = `${downloadDir}/TurboDownloader/.${id}_part_`;
    for (let i = 0; i < 16; i++) {
      try {
        const p = `${tempPrefix}${i}`;
        if (await ReactNativeBlobUtil.fs.exists(p)) await ReactNativeBlobUtil.fs.unlink(p);
        const pr = `${p}_resume`;
        if (await ReactNativeBlobUtil.fs.exists(pr)) await ReactNativeBlobUtil.fs.unlink(pr);
      } catch (e) {}
    }

    // Clean up single thread temporary files
    const download = this.downloads.find(d => d.id === id);
    if (download?.filePath) {
      try {
        const tp = `${download.filePath}.part`;
        if (await ReactNativeBlobUtil.fs.exists(tp)) await ReactNativeBlobUtil.fs.unlink(tp);
        const tpr = `${tp}_resume`;
        if (await ReactNativeBlobUtil.fs.exists(tpr)) await ReactNativeBlobUtil.fs.unlink(tpr);
        if (await ReactNativeBlobUtil.fs.exists(download.filePath)) await ReactNativeBlobUtil.fs.unlink(download.filePath);
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
          this._executeDownload(download).catch(err => {
            console.error('Queue download execution error:', err);
          });
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
      .reduce((sum, d) => {
        const s = (isFinite(d.speed) && d.speed > 0) ? d.speed : 0;
        return sum + s;
      }, 0);
  }

  updateMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
    this._processQueue();
  }
}

export const downloadEngine = new DownloadEngine();

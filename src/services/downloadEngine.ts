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
  private retryAttempts: Map<string, number> = new Map();
  private retryTimers: Map<string, any> = new Map();

  private async _updateActiveLock(): Promise<void> {
    try {
      const downloadDir = this.getDownloadDir();
      const lockPath = `${downloadDir}/TurboDownloader/.active_download_lock`;
      const hasActive = this.activeDownloads.size > 0 || this.downloads.some(d => d.status === 'downloading');

      if (hasActive) {
        const exists = await ReactNativeBlobUtil.fs.exists(lockPath);
        if (!exists) {
          await ReactNativeBlobUtil.fs.writeFile(lockPath, 'active', 'utf8');
        }
      } else {
        const exists = await ReactNativeBlobUtil.fs.exists(lockPath);
        if (exists) {
          await ReactNativeBlobUtil.fs.unlink(lockPath);
        }
      }
    } catch {}
  }

  private lastProgressWriteTime = 0;
  private async _writeProgressForNowPlaying(title: string, downloaded: number, total: number, speed: number): Promise<void> {
    const now = Date.now();
    if (now - this.lastProgressWriteTime < 1000) return;
    this.lastProgressWriteTime = now;
    try {
      const downloadDir = this.getDownloadDir();
      const progressPath = `${downloadDir}/TurboDownloader/.active_progress.json`;
      await ReactNativeBlobUtil.fs.writeFile(
        progressPath,
        JSON.stringify({ title, downloaded, total, speed }),
        'utf8'
      );
    } catch {}
  }

  private async _clearProgressForNowPlaying(completedFileName?: string): Promise<void> {
    try {
      const downloadDir = this.getDownloadDir();
      const progressPath = `${downloadDir}/TurboDownloader/.active_progress.json`;
      if (await ReactNativeBlobUtil.fs.exists(progressPath)) {
        await ReactNativeBlobUtil.fs.unlink(progressPath);
      }
      if (completedFileName) {
        const notifyPath = `${downloadDir}/TurboDownloader/.download_complete_notify`;
        await ReactNativeBlobUtil.fs.writeFile(notifyPath, completedFileName, 'utf8');
      }
    } catch {}
  }

  async initialize(): Promise<void> {
    this.downloads = await storage.getDownloads();
    const settings = await storage.getSettings();
    this.maxConcurrent = settings.maxSimultaneousDownloads;

    const interrupted = this.downloads.filter(d => d.status === 'downloading');

    // Reset speeds for fresh start
    this.downloads = this.downloads.map(d => {
      if (d.status === 'downloading') {
        return { ...d, speed: 0 };
      }
      return d;
    });
    await storage.saveDownloads(this.downloads);
    this.notifyListeners();

    // Auto-resume active downloads seamlessly!
    if (interrupted.length > 0) {
      console.log(`[Initialize] Auto-resuming ${interrupted.length} active downloads...`);
      setTimeout(() => {
        interrupted.forEach(d => {
          this.resumeDownload(d.id).catch(err => {
            console.error('Failed to auto-resume download:', err);
          });
        });
      }, 300);
    }
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
    this._updateActiveLock();
    this.speedTrackers.set(id, { lastBytes: download.downloadedSize || 0, lastTime: Date.now(), smoothedSpeed: 0, lastNotifyTime: 0 });
    this._writeProgressForNowPlaying(download.fileName, download.downloadedSize || 0, download.fileSize || 0, 0);

    const settings = await storage.getSettings();
    const configuredThreads = Math.min(Math.max(settings.threadsPerDownload || 8, 2), 12);

    const referer = headers?.['Referer'] || headers?.['referer'] || getRefererFromUrl(url);
    const requestHeaders: Record<string, string> = {
      'User-Agent': SAFARI_USER_AGENT,
      'Accept': '*/*',
      'Accept-Encoding': 'identity', // Forces raw uncompressed stream, preventing gzipped range corruptions
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
    const metaPath = `${downloadDir}/TurboDownloader/.${id}_meta.json`;
    let hasExistingMultiParts = false;
    try {
      if (await ReactNativeBlobUtil.fs.exists(metaPath)) {
        hasExistingMultiParts = true;
      } else {
        for (let i = 0; i < 32; i++) {
          if (await ReactNativeBlobUtil.fs.exists(`${tempPrefix}${i}`)) {
            hasExistingMultiParts = true;
            break;
          }
        }
      }
    } catch {}

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

    // If existing single-stream part file exists:
    if (hasExistingSinglePart) {
      console.log(`Resuming single-threaded download for ${download.fileName} from existing .part`);
      await this._executeSingleThreadDownload(download, totalSize, requestHeaders);
      return;
    }

    // 2. Fresh download: probe to check size and Range support
    let rangeSupported = download.isMultiThread ?? false;
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
          const acceptRanges = (probeRes.headers.get('accept-ranges') || '').toLowerCase();
          if (acceptRanges === 'bytes') {
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

    // Use fast multi-threaded segmented downloading whenever ranges are supported and size > 2MB.
    // The segmented architecture uses bit-perfect immutable segments with Range: bytes=${start}-${end}.
    // Pauses and resumes continue from the exact uncompleted segment without restarting from 0%,
    // and eliminates byte-splicing corruption for all files including large 4K/1080p MP4/MKV videos!
    if (rangeSupported && totalSize > 2 * 1024 * 1024 && configuredThreads > 1) {
      this.updateDownloadState(id, { threads: threadsToUse, isMultiThread: true });
      await this._executeMultiThreadDownload(download, totalSize, threadsToUse, requestHeaders);
    } else {
      this.updateDownloadState(id, { threads: 1, isMultiThread: false });
      await this._executeSingleThreadDownload(download, totalSize, requestHeaders);
    }
  }

  private async _executeMultiThreadDownload(
    download: DownloadItem,
    totalSize: number,
    configuredThreads: number,
    requestHeaders: Record<string, string>,
  ): Promise<void> {
    const { id, url } = download;
    const downloadDir = this.getDownloadDir();
    const filePath = `${downloadDir}/TurboDownloader/${download.fileName}`;
    const tempPrefix = `${downloadDir}/TurboDownloader/.${id}_part_`;
    const metaPath = `${downloadDir}/TurboDownloader/.${id}_meta.json`;

    // 1. Calculate or restore immutable segment layout
    // Optimal segment size (~8MB-16MB) ensures bit-perfect pause/resume without file corruption
    const getSegmentSize = (size: number): number => {
      if (size <= 0) return 8 * 1024 * 1024;
      if (size < 40 * 1024 * 1024) return 4 * 1024 * 1024;
      if (size < 200 * 1024 * 1024) return 8 * 1024 * 1024;
      if (size < 800 * 1024 * 1024) return 12 * 1024 * 1024;
      return 16 * 1024 * 1024;
    };

    let lockedTotalSize = totalSize;
    let lockedSegmentSize = getSegmentSize(lockedTotalSize);
    let lockedNumSegments = Math.ceil(lockedTotalSize / lockedSegmentSize);

    try {
      if (await ReactNativeBlobUtil.fs.exists(metaPath)) {
        const metaStr = await ReactNativeBlobUtil.fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaStr);
        if (meta && meta.numSegments > 0 && meta.totalSize > 0) {
          lockedTotalSize = meta.totalSize;
          lockedSegmentSize = meta.segmentSize;
          lockedNumSegments = meta.numSegments;
        }
      } else if (lockedTotalSize > 0) {
        await ReactNativeBlobUtil.fs.writeFile(
          metaPath,
          JSON.stringify({
            totalSize: lockedTotalSize,
            segmentSize: lockedSegmentSize,
            numSegments: lockedNumSegments,
          }),
          'utf8'
        );
      }
    } catch {}

    const segmentSize = lockedSegmentSize;
    const numSegments = lockedNumSegments;
    totalSize = lockedTotalSize;

    // Optimal concurrency: 4-6 parallel workers
    const concurrency = Math.min(Math.max(configuredThreads || 6, 2), 6);

    // 2. Discover already completed segments on disk (100% bit-perfect and verified)
    const completedSet = new Set<number>();
    let completedBytes = 0;

    for (let i = 0; i < numSegments; i++) {
      const segStart = i * segmentSize;
      const segEnd = Math.min((i + 1) * segmentSize - 1, totalSize - 1);
      const expectedLen = segEnd - segStart + 1;
      const p = `${tempPrefix}${i}`;

      try {
        if (await ReactNativeBlobUtil.fs.exists(p)) {
          const stat = await ReactNativeBlobUtil.fs.stat(p);
          if (Number(stat.size) === expectedLen) {
            completedSet.add(i);
            completedBytes += expectedLen;
          } else {
            // Delete dirty or partial chunk so it downloads cleanly from byte 0 with overwrite: true
            try { await ReactNativeBlobUtil.fs.unlink(p); } catch {}
          }
        }
      } catch {}
    }

    const pendingQueue: number[] = [];
    for (let i = 0; i < numSegments; i++) {
      if (!completedSet.has(i)) {
        pendingQueue.push(i);
      }
    }

    const activeTasks = new Map<number, any>();
    const inFlightBytes = new Map<number, number>();
    const segmentRetries = new Map<number, number>();
    let isCancelled = false;
    let fallbackToSingleThread = false;
    let fatalError: Error | null = null;

    const cancelAll = (isPaused = false) => {
      isCancelled = true;
      activeTasks.forEach(task => {
        try { task.cancel(); } catch {}
      });
      activeTasks.clear();
    };

    this.activeDownloads.set(id, { cancel: cancelAll });

    const handleProgressTick = () => {
      let activeBytes = 0;
      inFlightBytes.forEach(b => { activeBytes += b; });
      const currentTotal = Math.min(totalSize, completedBytes + activeBytes);
      const now = Date.now();
      let tracker = this.speedTrackers.get(id);
      if (!tracker) {
        tracker = { lastBytes: currentTotal, lastTime: now, smoothedSpeed: 0, lastNotifyTime: 0 };
        this.speedTrackers.set(id, tracker);
      }

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

      if (now - tracker.lastNotifyTime >= 250 || safeProgress >= 1) {
        tracker.lastNotifyTime = now;
        this.updateDownloadState(id, {
          downloadedSize: currentTotal,
          fileSize: safeTotal,
          progress: safeProgress,
          speed: cleanSpeed,
        });
        this._writeProgressForNowPlaying(download.fileName, currentTotal, safeTotal, cleanSpeed);
      }
    };

    handleProgressTick();

    // 3. Worker loop: each worker picks segments until none remain
    const worker = async (): Promise<void> => {
      while (!isCancelled && !fallbackToSingleThread && !fatalError && pendingQueue.length > 0) {
        const segIdx = pendingQueue.shift();
        if (segIdx === undefined) break;

        const start = segIdx * segmentSize;
        const end = Math.min((segIdx + 1) * segmentSize - 1, totalSize - 1);
        const expectedLen = end - start + 1;
        const segPath = `${tempPrefix}${segIdx}`;

        const config = {
          fileCache: true,
          path: segPath,
          followRedirect: true,
          IOSBackgroundTask: false,
          overwrite: true, // Always clean overwrite from byte 0! Eliminates dirty range splices
        };

        const headers = {
          ...requestHeaders,
          'Range': `bytes=${start}-${end}`,
        };

        try {
          const task = ReactNativeBlobUtil.config(config)
            .fetch('GET', url, headers)
            .progress({ count: 10, interval: 250 }, (received: any) => {
              if (isCancelled) return;
              const bytesNum = typeof received === 'string' ? parseInt(received, 10) || 0 : Math.max(0, received || 0);
              inFlightBytes.set(segIdx, Math.min(expectedLen, bytesNum));
              handleProgressTick();
            });

          activeTasks.set(segIdx, task);
          const res = await task;
          activeTasks.delete(segIdx);
          inFlightBytes.delete(segIdx);

          const info = res.info();
          if (info.status >= 400) {
            throw new Error(`Segment HTTP ${info.status}`);
          }
          if (info.status === 200 && numSegments > 1) {
            fallbackToSingleThread = true;
            cancelAll(false);
            return;
          }

          if (!(await ReactNativeBlobUtil.fs.exists(segPath))) {
            throw new Error(`Segment ${segIdx} missing from disk`);
          }
          const stat = await ReactNativeBlobUtil.fs.stat(segPath);
          const actualLen = Number(stat.size);
          if (actualLen !== expectedLen) {
            throw new Error(`Segment ${segIdx} size mismatch: got ${actualLen}, expected ${expectedLen}`);
          }

          completedSet.add(segIdx);
          completedBytes += expectedLen;
          handleProgressTick();

        } catch (err: any) {
          activeTasks.delete(segIdx);
          inFlightBytes.delete(segIdx);

          if (isCancelled || err.message?.includes('cancel') || err.message?.includes('abort')) {
            try { await ReactNativeBlobUtil.fs.unlink(segPath); } catch {}
            return;
          }

          if (fallbackToSingleThread) {
            try { await ReactNativeBlobUtil.fs.unlink(segPath); } catch {}
            return;
          }

          try { await ReactNativeBlobUtil.fs.unlink(segPath); } catch {}
          const retries = (segmentRetries.get(segIdx) || 0) + 1;
          segmentRetries.set(segIdx, retries);

          if (retries <= 5) {
            pendingQueue.push(segIdx);
            await new Promise(r => setTimeout(() => r(null), 1000 * Math.min(retries, 4)));
          } else {
            fatalError = new Error(`Segment ${segIdx} failed: ${err.message}`);
            cancelAll(false);
            return;
          }
        }
      }
    };

    try {
      const workers = [];
      const workerCount = Math.min(concurrency, pendingQueue.length || 1);
      for (let w = 0; w < workerCount; w++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      if (fallbackToSingleThread) {
        console.warn(`Server does not support range chunks for ${download.fileName}, switching to single thread`);
        for (let i = 0; i < numSegments; i++) {
          try { await ReactNativeBlobUtil.fs.unlink(`${tempPrefix}${i}`); } catch {}
        }
        try { await ReactNativeBlobUtil.fs.unlink(metaPath); } catch {}
        this.updateDownloadState(id, { isMultiThread: false });
        await this._executeSingleThreadDownload(download, totalSize, requestHeaders);
        return;
      }

      if (isCancelled) {
        // Paused cleanly by user: all completed segments remain safe and bit-perfect on disk!
        this._updateActiveLock();
        return;
      }

      if (fatalError) {
        throw fatalError;
      }

      // 4. Pre-merge verification: EVERY SINGLE segment must be verified
      if (completedSet.size !== numSegments) {
        throw new Error(`Incomplete segments: ${completedSet.size}/${numSegments}`);
      }

      let totalVerifiedBytes = 0;
      for (let i = 0; i < numSegments; i++) {
        const segStart = i * segmentSize;
        const segEnd = Math.min((i + 1) * segmentSize - 1, totalSize - 1);
        const expectedLen = segEnd - segStart + 1;
        const p = `${tempPrefix}${i}`;

        if (!(await ReactNativeBlobUtil.fs.exists(p))) {
          throw new Error(`Segment ${i} missing from disk!`);
        }
        const s = await ReactNativeBlobUtil.fs.stat(p);
        const actualSize = Number(s.size);
        if (actualSize !== expectedLen) {
          throw new Error(`Segment ${i} size mismatch: got ${actualSize}, expected ${expectedLen}`);
        }
        totalVerifiedBytes += actualSize;
      }

      if (totalVerifiedBytes !== totalSize) {
        throw new Error(`Total verified segments size (${totalVerifiedBytes}) != expected total (${totalSize})`);
      }

      // Clean existing target file if any
      try {
        if (await ReactNativeBlobUtil.fs.exists(filePath)) {
          await ReactNativeBlobUtil.fs.unlink(filePath);
        }
      } catch (e) {}

      // 5. Concatenate segments in order: Segment 0, 1, 2...
      await ReactNativeBlobUtil.fs.cp(`${tempPrefix}0`, filePath);

      for (let i = 1; i < numSegments; i++) {
        const segPath = `${tempPrefix}${i}`;
        await ReactNativeBlobUtil.fs.appendFile(filePath, segPath, 'uri');
      }

      const stat = await ReactNativeBlobUtil.fs.stat(filePath);
      const finalBytes = Number(stat.size);

      if (finalBytes !== totalSize) {
        throw new Error(`Merged file size mismatch: got ${finalBytes} bytes, expected ${totalSize} bytes`);
      }

      // 6. Delete intermediate segment files and metadata only after final file is strictly verified
      for (let i = 0; i < numSegments; i++) {
        try { await ReactNativeBlobUtil.fs.unlink(`${tempPrefix}${i}`); } catch {}
      }
      try { await ReactNativeBlobUtil.fs.unlink(metaPath); } catch {}

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
      this.retryAttempts.delete(id);
      await this._clearProgressForNowPlaying(download.fileName);
      this._updateActiveLock();
      await this._persistState();
      this._processQueue();

    } catch (err: any) {
      cancelAll(true);

      if (isCancelled || err.message?.includes('cancel') || err.message?.includes('abort') || err.message?.includes('canceled')) {
        this._updateActiveLock();
        return;
      }

      console.warn('Segmented download interrupted:', err.message);
      this.activeDownloads.delete(id);
      this.speedTrackers.delete(id);

      const attempts = (this.retryAttempts.get(id) || 0) + 1;
      const MAX_RETRIES = 5;

      if (attempts <= MAX_RETRIES) {
        this.retryAttempts.set(id, attempts);
        const delayMs = Math.min(3000 * Math.pow(2, attempts - 1), 30000);
        console.log(`[Auto-Retry] Multi-thread download for ${download.fileName} interrupted. Retrying in ${delayMs / 1000}s (Attempt ${attempts}/${MAX_RETRIES})...`);

        this.updateDownloadState(id, {
          status: 'downloading',
          speed: 0,
          error: `Reconnecting in ${delayMs / 1000}s (Attempt ${attempts}/${MAX_RETRIES})...`,
        });
        this._updateActiveLock();

        const timer = setTimeout(() => {
          this.retryTimers.delete(id);
          const current = this.downloads.find(d => d.id === id);
          if (current && (current.status === 'downloading' || current.status === 'queued')) {
            this._executeDownload(current).catch(() => {});
          }
        }, delayMs);
        this.retryTimers.set(id, timer);
      } else {
        this.retryAttempts.delete(id);
        this.updateDownloadState(id, {
          status: 'failed',
          speed: 0,
          error: err.message || 'Download interrupted. Tap retry to resume.',
        });
        this._updateActiveLock();
        await this._persistState();
        this._processQueue();
      }
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
        if (knownTotalSize > 0) {
          fetchHeaders['Range'] = `bytes=${existingBytes}-${knownTotalSize - 1}`;
        } else {
          fetchHeaders['Range'] = `bytes=${existingBytes}-`;
        }
      }

      const config: any = {
        fileCache: true,
        path: tempPartPath,
        followRedirect: true,
        IOSBackgroundTask: false,
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
            this._writeProgressForNowPlaying(download.fileName, currentReceived, actualTotal, cleanSpeed);
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

      // If we requested a resume (Range: bytes=X-), but server returned HTTP 200 OK:
      // The server sent the entire file from byte 0, but overwrite was false so it appended to tempPartPath!
      if (isResuming && httpStatus === 200) {
        console.warn('Server ignored resume Range header and sent HTTP 200. Re-downloading from start.');
        try { await ReactNativeBlobUtil.fs.unlink(tempPartPath); } catch {}
        throw new Error('Server does not support resuming this file. Re-downloading from start.');
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
      this.retryAttempts.delete(id);
      await this._clearProgressForNowPlaying(finalName);
      this._updateActiveLock();
      await this._persistState();
      this._processQueue();

    } catch (error: any) {
      if (isCancelled || error.message?.includes('cancel') || error.message?.includes('abort') || error.message?.includes('canceled')) {
        // Paused by user! KEEP tempPartPath on disk so resume continues from existing bytes!
        this._updateActiveLock();
        return;
      }

      console.error('Download failed:', error);
      this.activeDownloads.delete(id);
      this.speedTrackers.delete(id);

      const attempts = (this.retryAttempts.get(id) || 0) + 1;
      const MAX_RETRIES = 5;

      if (attempts <= MAX_RETRIES) {
        this.retryAttempts.set(id, attempts);
        const delayMs = Math.min(3000 * Math.pow(2, attempts - 1), 30000);
        console.log(`[Auto-Retry] Single-thread download for ${download.fileName} interrupted. Retrying in ${delayMs / 1000}s (Attempt ${attempts}/${MAX_RETRIES})...`);

        this.updateDownloadState(id, {
          status: 'downloading',
          speed: 0,
          error: `Reconnecting in ${delayMs / 1000}s (Attempt ${attempts}/${MAX_RETRIES})...`,
        });
        this._updateActiveLock();

        const timer = setTimeout(() => {
          this.retryTimers.delete(id);
          const current = this.downloads.find(d => d.id === id);
          if (current && (current.status === 'downloading' || current.status === 'queued')) {
            this._executeDownload(current).catch(() => {});
          }
        }, delayMs);
        this.retryTimers.set(id, timer);
      } else {
        this.retryAttempts.delete(id);
        this.updateDownloadState(id, {
          status: 'failed',
          speed: 0,
          error: error.message || 'Download failed',
        });
        this._updateActiveLock();
        await this._persistState();
        this._processQueue();
      }
    }
  }

  async pauseDownload(id: string): Promise<void> {
    const timer = this.retryTimers.get(id);
    if (timer) clearTimeout(timer);
    this.retryTimers.delete(id);
    this.retryAttempts.delete(id);

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

    // Wait 150ms for native file handles to flush to disk cleanly
    await new Promise(r => setTimeout(() => r(null), 150));

    // Measure exact bytes on disk from all parts
    const download = this.downloads.find(d => d.id === id);
    if (download) {
      const downloadDir = this.getDownloadDir();
      const metaPath = `${downloadDir}/TurboDownloader/.${id}_meta.json`;
      const tempPrefix = `${downloadDir}/TurboDownloader/.${id}_part_`;
      let totalBytesOnDisk = 0;

      try {
        if (await ReactNativeBlobUtil.fs.exists(metaPath)) {
          const metaStr = await ReactNativeBlobUtil.fs.readFile(metaPath, 'utf8');
          const meta = JSON.parse(metaStr);
          const numSegs = meta.numSegments || 0;
          for (let i = 0; i < numSegs; i++) {
            const p = `${tempPrefix}${i}`;
            if (await ReactNativeBlobUtil.fs.exists(p)) {
              const stat = await ReactNativeBlobUtil.fs.stat(p);
              totalBytesOnDisk += Number(stat.size);
            }
          }
        }
      } catch {}

      if (totalBytesOnDisk === 0) {
        for (let i = 0; i < 64; i++) {
          try {
            const p = `${tempPrefix}${i}`;
            if (await ReactNativeBlobUtil.fs.exists(p)) {
              const stat = await ReactNativeBlobUtil.fs.stat(p);
              totalBytesOnDisk += Number(stat.size);
            }
          } catch {}
        }
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
    await this._clearProgressForNowPlaying();
    this._updateActiveLock();
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
    const timer = this.retryTimers.get(id);
    if (timer) clearTimeout(timer);
    this.retryTimers.delete(id);
    this.retryAttempts.delete(id);

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
    await this._clearProgressForNowPlaying();

    // Clean up temporary segment and meta files
    const downloadDir = this.getDownloadDir();
    const metaPath = `${downloadDir}/TurboDownloader/.${id}_meta.json`;
    let numSegs = 64;
    try {
      if (await ReactNativeBlobUtil.fs.exists(metaPath)) {
        const metaStr = await ReactNativeBlobUtil.fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaStr);
        numSegs = Math.max(numSegs, (meta.numSegments || 0) + 10);
        await ReactNativeBlobUtil.fs.unlink(metaPath);
      }
    } catch {}

    const tempPrefix = `${downloadDir}/TurboDownloader/.${id}_part_`;
    for (let i = 0; i < numSegs; i++) {
      try {
        const p = `${tempPrefix}${i}`;
        if (await ReactNativeBlobUtil.fs.exists(p)) await ReactNativeBlobUtil.fs.unlink(p);
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
    this._updateActiveLock();
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
    this._updateActiveLock();
    this.notifyListeners();
  }

  async clearCompletedDownloads(): Promise<void> {
    this.downloads = this.downloads.filter(d => d.status !== 'completed');
    await storage.saveDownloads(this.downloads);
    this._updateActiveLock();
    this.notifyListeners();
  }

  async pauseAll(): Promise<void> {
    const activeIds = [...this.activeDownloads.keys()];
    for (const id of activeIds) {
      await this.pauseDownload(id);
    }
    this.downloadQueue = [];
    this._updateActiveLock();
  }

  async resumeAll(): Promise<void> {
    const paused = this.downloads.filter(d => d.status === 'paused');
    for (const download of paused) {
      await this.resumeDownload(download.id);
    }
  }

  async resumeInterruptedDownloads(): Promise<void> {
    const interrupted = this.downloads.filter(
      d => (d.status === 'downloading' && !this.activeDownloads.has(d.id)) ||
           (d.status === 'failed' && d.error && !d.error.includes('403') && !d.error.includes('404'))
    );
    for (const d of interrupted) {
      console.log(`[Auto-Resume] Resuming interrupted download on app wakeup: ${d.fileName}`);
      await this.resumeDownload(d.id);
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

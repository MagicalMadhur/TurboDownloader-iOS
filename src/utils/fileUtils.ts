// File type utilities
export type FileCategory = 'video' | 'audio' | 'document' | 'image' | 'archive' | 'other';

const FILE_EXTENSIONS: Record<FileCategory, string[]> = {
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ts', 'mpg', 'mpeg'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma', 'opus', 'aiff'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv', 'epub', 'mobi'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff', 'ico', 'heic', 'heif'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'dmg', 'iso'],
  other: [],
};

const MIME_TO_CATEGORY: Record<string, FileCategory> = {
  'video': 'video',
  'audio': 'audio',
  'image': 'image',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats': 'document',
  'application/zip': 'archive',
  'application/x-rar': 'archive',
  'application/x-7z': 'archive',
  'text': 'document',
};

export function getFileExtension(url: string): string {
  if (!url) return '';
  try {
    const urlObj = new URL(url);
    // 1. Check pathname
    const pathname = urlObj.pathname;
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot !== -1) {
      const ext = pathname.substring(lastDot + 1).toLowerCase().split('?')[0].split('#')[0];
      if (ext && ext.length <= 8 && !ext.includes('/')) return ext;
    }
    // 2. Check query params (e.g. ?file=video.mkv or ?name=test.zip)
    for (const [, val] of urlObj.searchParams) {
      const qDot = val.lastIndexOf('.');
      if (qDot !== -1) {
        const qExt = val.substring(qDot + 1).toLowerCase().split('?')[0].split('#')[0];
        if (qExt && qExt.length <= 8 && !qExt.includes('/')) return qExt;
      }
    }
  } catch {
    const lastDot = url.lastIndexOf('.');
    if (lastDot !== -1) {
      const ext = url.substring(lastDot + 1).toLowerCase().split('?')[0].split('#')[0];
      if (ext && ext.length <= 8 && !ext.includes('/')) return ext;
    }
  }
  return '';
}

export function getFileCategory(url: string, mimeType?: string): FileCategory {
  // First try MIME type
  if (mimeType) {
    for (const [key, category] of Object.entries(MIME_TO_CATEGORY)) {
      if (mimeType.startsWith(key)) return category;
    }
  }
  
  // Then try extension
  const ext = getFileExtension(url);
  for (const [category, extensions] of Object.entries(FILE_EXTENSIONS)) {
    if (extensions.includes(ext)) return category as FileCategory;
  }
  
  return 'other';
}

export function getFileName(url: string): string {
  if (!url) return 'download_file';
  try {
    const urlObj = new URL(url);

    // 1. Check common query parameters for actual file name
    for (const param of ['filename', 'file', 'name', 'title', 'attachment_filename']) {
      const val = urlObj.searchParams.get(param);
      if (val) {
        const decoded = decodeURIComponent(val).trim();
        if (decoded && decoded.includes('.')) {
          return sanitizeFileName(decoded);
        }
      }
    }

    // 2. Check pathname segments
    const pathname = urlObj.pathname;
    const segments = pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      const decoded = decodeURIComponent(lastSegment).trim();
      const lower = decoded.toLowerCase();
      // Skip generic server scripts
      if (
        !lower.endsWith('.php') &&
        !lower.endsWith('.html') &&
        !lower.endsWith('.htm') &&
        !lower.endsWith('.asp') &&
        !lower.endsWith('.aspx')
      ) {
        return sanitizeFileName(decoded);
      }
    }
  } catch {}
  
  // Fallback: generate clean name with timestamp and extension
  const timestamp = Date.now();
  const ext = getFileExtension(url) || 'bin';
  return `download_${timestamp}.${ext}`;
}

export function formatFileSize(bytes: number): string {
  if (!isFinite(bytes) || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const safeI = Math.max(0, i);
  const val = bytes / Math.pow(k, safeI);
  return `${parseFloat(val.toFixed(2))} ${units[safeI]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!isFinite(bytesPerSecond) || isNaN(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytesPerSecond) / Math.log(k)), units.length - 1);
  const safeI = Math.max(0, i);
  const val = bytesPerSecond / Math.pow(k, safeI);
  return `${parseFloat(val.toFixed(1))} ${units[safeI]}`;
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds <= 0) return '--:--';
  if (seconds > 86400 * 3) return '> 3 days';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function getCategoryIcon(category: FileCategory): string {
  switch (category) {
    case 'video': return 'videocam';
    case 'audio': return 'musical-notes';
    case 'document': return 'document-text';
    case 'image': return 'image';
    case 'archive': return 'archive';
    default: return 'document';
  }
}

export function getCategoryColor(category: FileCategory): string {
  const { Colors } = require('../theme/colors');
  switch (category) {
    case 'video': return Colors.fileVideo;
    case 'audio': return Colors.fileAudio;
    case 'document': return Colors.fileDocument;
    case 'image': return Colors.fileImage;
    case 'archive': return Colors.fileArchive;
    default: return Colors.fileOther;
  }
}

// Check if URL looks like a downloadable file
export function isDownloadableUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();

  // Exclude plain web pages without download query
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return false;
  }

  const downloadableExtensions = [
    ...FILE_EXTENSIONS.video,
    ...FILE_EXTENSIONS.audio,
    ...FILE_EXTENSIONS.document,
    ...FILE_EXTENSIONS.image,
    ...FILE_EXTENSIONS.archive,
    'apk', 'ipa', 'exe', 'msi', 'deb', 'rpm', 'bin', 'dat', 'iso', 'torrent',
  ];

  // 1. Direct extension match
  const ext = getFileExtension(url);
  if (ext && downloadableExtensions.includes(ext)) {
    return true;
  }

  // 2. Extension appears in URL path or query params (e.g. ?file=movie.mkv or /stream/video.mp4?token=...)
  for (const de of downloadableExtensions) {
    const pattern = new RegExp(`\\.${de}([?&#/]|$)`, 'i');
    if (pattern.test(lower)) {
      return true;
    }
  }

  // 3. Common file hosting and download server URL patterns
  if (
    lower.includes('export=download') ||
    lower.includes('dl=1') ||
    lower.includes('download=true') ||
    lower.includes('download=1') ||
    lower.includes('action=download') ||
    lower.includes('response-content-disposition=attachment') ||
    (lower.includes('/api/file/') && lower.includes('download')) ||
    (lower.includes('gofile.io/download') && !lower.endsWith('.html')) ||
    (lower.includes('pixeldrain.com/api/file/') && lower.includes('download'))
  ) {
    return true;
  }

  return false;
}

// Validate URL
export function isValidUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Sanitize filename for filesystem
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200);
}

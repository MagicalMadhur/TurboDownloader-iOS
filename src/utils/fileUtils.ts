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
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot === -1) return '';
    return pathname.substring(lastDot + 1).toLowerCase().split('?')[0];
  } catch {
    const lastDot = url.lastIndexOf('.');
    if (lastDot === -1) return '';
    return url.substring(lastDot + 1).toLowerCase().split('?')[0].split('#')[0];
  }
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
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const segments = pathname.split('/');
    const lastSegment = segments[segments.length - 1];
    if (lastSegment) {
      return decodeURIComponent(lastSegment);
    }
  } catch {}
  
  // Fallback: generate name from URL
  const timestamp = Date.now();
  const ext = getFileExtension(url) || 'bin';
  return `download_${timestamp}.${ext}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const k = 1024;
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + ' ' + units[i];
}

export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--:--';
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
  const ext = getFileExtension(url);
  const downloadableExtensions = [
    ...FILE_EXTENSIONS.video,
    ...FILE_EXTENSIONS.audio,
    ...FILE_EXTENSIONS.document,
    ...FILE_EXTENSIONS.image,
    ...FILE_EXTENSIONS.archive,
    'apk', 'ipa', 'exe', 'msi', 'deb', 'rpm', 'bin', 'dat',
  ];
  return downloadableExtensions.includes(ext);
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

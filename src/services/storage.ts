import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  DOWNLOADS: '@turbo_downloads',
  SETTINGS: '@turbo_settings',
  BOOKMARKS: '@turbo_bookmarks',
  BROWSER_HISTORY: '@turbo_browser_history',
};

export interface DownloadItem {
  id: string;
  url: string;
  fileName: string;
  filePath: string;
  fileSize: number; // total bytes
  downloadedSize: number; // bytes downloaded so far
  speed: number; // bytes per second
  progress: number; // 0-1
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'cancelled';
  category: string;
  mimeType?: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
  resumable: boolean;
}

export interface AppSettings {
  maxSimultaneousDownloads: number;
  wifiOnly: boolean;
  showNotifications: boolean;
  autoRetry: boolean;
  maxRetries: number;
  defaultSearchEngine: 'google' | 'duckduckgo' | 'bing';
  adBlockEnabled: boolean;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  createdAt: string;
}

export interface BrowserHistoryItem {
  url: string;
  title: string;
  visitedAt: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  maxSimultaneousDownloads: 3,
  wifiOnly: false,
  showNotifications: true,
  autoRetry: true,
  maxRetries: 3,
  defaultSearchEngine: 'google',
  adBlockEnabled: true,
};

class StorageService {
  // Downloads
  async getDownloads(): Promise<DownloadItem[]> {
    try {
      const data = await AsyncStorage.getItem(KEYS.DOWNLOADS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading downloads:', error);
      return [];
    }
  }

  async saveDownloads(downloads: DownloadItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.DOWNLOADS, JSON.stringify(downloads));
    } catch (error) {
      console.error('Error saving downloads:', error);
    }
  }

  async addDownload(download: DownloadItem): Promise<void> {
    const downloads = await this.getDownloads();
    downloads.unshift(download);
    await this.saveDownloads(downloads);
  }

  async updateDownload(id: string, updates: Partial<DownloadItem>): Promise<void> {
    const downloads = await this.getDownloads();
    const index = downloads.findIndex(d => d.id === id);
    if (index !== -1) {
      downloads[index] = { ...downloads[index], ...updates };
      await this.saveDownloads(downloads);
    }
  }

  async removeDownload(id: string): Promise<void> {
    const downloads = await this.getDownloads();
    const filtered = downloads.filter(d => d.id !== id);
    await this.saveDownloads(filtered);
  }

  // Settings
  async getSettings(): Promise<AppSettings> {
    try {
      const data = await AsyncStorage.getItem(KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  // Bookmarks
  async getBookmarks(): Promise<Bookmark[]> {
    try {
      const data = await AsyncStorage.getItem(KEYS.BOOKMARKS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  async addBookmark(bookmark: Bookmark): Promise<void> {
    const bookmarks = await this.getBookmarks();
    bookmarks.unshift(bookmark);
    await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(bookmarks));
  }

  async removeBookmark(id: string): Promise<void> {
    const bookmarks = await this.getBookmarks();
    const filtered = bookmarks.filter(b => b.id !== id);
    await AsyncStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(filtered));
  }

  // Browser History
  async getBrowserHistory(): Promise<BrowserHistoryItem[]> {
    try {
      const data = await AsyncStorage.getItem(KEYS.BROWSER_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  async addToHistory(item: BrowserHistoryItem): Promise<void> {
    const history = await this.getBrowserHistory();
    // Remove duplicate if exists
    const filtered = history.filter(h => h.url !== item.url);
    filtered.unshift(item);
    // Keep only last 200 entries
    const trimmed = filtered.slice(0, 200);
    await AsyncStorage.setItem(KEYS.BROWSER_HISTORY, JSON.stringify(trimmed));
  }

  async clearHistory(): Promise<void> {
    await AsyncStorage.setItem(KEYS.BROWSER_HISTORY, JSON.stringify([]));
  }

  // Clear all data
  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
  }
}

export const storage = new StorageService();

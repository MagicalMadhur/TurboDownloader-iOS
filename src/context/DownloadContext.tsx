import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { downloadEngine } from '../services/downloadEngine';
import { storage, DownloadItem, AppSettings, DEFAULT_SETTINGS } from '../services/storage';

type IntervalId = ReturnType<typeof setInterval>;
interface DownloadContextType {
  downloads: DownloadItem[];
  activeDownloads: DownloadItem[];
  completedDownloads: DownloadItem[];
  settings: AppSettings;
  totalSpeed: number;
  isInitialized: boolean;
  startDownload: (url: string, fileName?: string) => Promise<DownloadItem | null>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  deleteDownload: (id: string, deleteFile?: boolean) => Promise<void>;
  retryDownload: (id: string) => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;
  clearCompleted: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
}

const DownloadContext = createContext<DownloadContextType | null>(null);

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isInitialized, setIsInitialized] = useState(false);
  const [totalSpeed, setTotalSpeed] = useState(0);
  const speedIntervalRef = useRef<IntervalId | null>(null);

  useEffect(() => {
    const init = async () => {
      await downloadEngine.initialize();
      const savedSettings = await storage.getSettings();
      setSettings(savedSettings);
      setIsInitialized(true);
    };
    init();
  }, []);

  useEffect(() => {
    const unsubscribe = downloadEngine.subscribe((updatedDownloads) => {
      setDownloads(updatedDownloads);
    });
    return unsubscribe;
  }, []);

  // Track total speed
  useEffect(() => {
    speedIntervalRef.current = setInterval(() => {
      setTotalSpeed(downloadEngine.getTotalSpeed());
    }, 500);
    return () => {
      if (speedIntervalRef.current) clearInterval(speedIntervalRef.current);
    };
  }, []);

  // Auto-resume interrupted downloads whenever app wakes up or becomes active
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        downloadEngine.resumeInterruptedDownloads();
      }
    });
    return () => subscription.remove();
  }, []);

  const activeDownloads = downloads.filter(
    d => d.status === 'downloading' || d.status === 'queued',
  );
  const completedDownloads = downloads.filter(d => d.status === 'completed');

  const startDownload = useCallback(async (url: string, fileName?: string) => {
    try {
      return await downloadEngine.startDownload(url, fileName);
    } catch (error) {
      console.error('Failed to start download:', error);
      return null;
    }
  }, []);

  const pauseDownload = useCallback(async (id: string) => {
    await downloadEngine.pauseDownload(id);
  }, []);

  const resumeDownload = useCallback(async (id: string) => {
    await downloadEngine.resumeDownload(id);
  }, []);

  const cancelDownload = useCallback(async (id: string) => {
    await downloadEngine.cancelDownload(id);
  }, []);

  const deleteDownload = useCallback(async (id: string, deleteFile = false) => {
    await downloadEngine.deleteDownload(id, deleteFile);
  }, []);

  const retryDownload = useCallback(async (id: string) => {
    await downloadEngine.retryDownload(id);
  }, []);

  const pauseAll = useCallback(async () => {
    await downloadEngine.pauseAll();
  }, []);

  const resumeAll = useCallback(async () => {
    await downloadEngine.resumeAll();
  }, []);

  const clearCompleted = useCallback(async () => {
    await downloadEngine.clearCompletedDownloads();
  }, []);

  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await storage.saveSettings(updated);
    if (newSettings.maxSimultaneousDownloads !== undefined) {
      downloadEngine.updateMaxConcurrent(newSettings.maxSimultaneousDownloads);
    }
  }, [settings]);

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        activeDownloads,
        completedDownloads,
        settings,
        totalSpeed,
        isInitialized,
        startDownload,
        pauseDownload,
        resumeDownload,
        cancelDownload,
        deleteDownload,
        retryDownload,
        pauseAll,
        resumeAll,
        clearCompleted,
        updateSettings,
      }}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownloads(): DownloadContextType {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownloads must be used within a DownloadProvider');
  }
  return context;
}

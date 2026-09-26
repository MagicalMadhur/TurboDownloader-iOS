import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Shadows } from '../theme';
import { useDownloads } from '../context/DownloadContext';
import { DownloadCard } from '../components/DownloadCard';
import { SpeedMeter } from '../components/SpeedMeter';
import { AddDownloadModal } from '../components/AddDownloadModal';
import { DownloadItem } from '../services/storage';
import ReactNativeBlobUtil from 'react-native-blob-util';

type FilterType = 'all' | 'active' | 'completed' | 'failed';

export function DownloadsScreen() {
  const {
    downloads,
    activeDownloads,
    totalSpeed,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    deleteDownload,
    retryDownload,
    pauseAll,
    resumeAll,
    clearCompleted,
  } = useDownloads();

  const [showAddModal, setShowAddModal] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);

  const filteredDownloads = downloads.filter(d => {
    switch (filter) {
      case 'active':
        return d.status === 'downloading' || d.status === 'queued' || d.status === 'paused';
      case 'completed':
        return d.status === 'completed';
      case 'failed':
        return d.status === 'failed' || d.status === 'cancelled';
      default:
        return true;
    }
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Small delay for visual feedback
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const handleDeleteDownload = (download: DownloadItem) => {
    Alert.alert(
      'Delete Download',
      `Delete "${download.fileName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Record Only',
          onPress: () => deleteDownload(download.id, false),
        },
        {
          text: 'Delete File & Record',
          style: 'destructive',
          onPress: () => deleteDownload(download.id, true),
        },
      ],
    );
  };

  const handleOpenFile = async (download: DownloadItem) => {
    try {
      if (download.filePath) {
        const exists = await ReactNativeBlobUtil.fs.exists(download.filePath);
        if (exists) {
          // Open with system viewer
          ReactNativeBlobUtil.ios.openDocument(download.filePath);
        } else {
          Alert.alert('File Not Found', 'The downloaded file could not be found.');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open the file.');
    }
  };

  const handleStartDownload = async (url: string, fileName?: string) => {
    await startDownload(url, fileName);
  };

  const getFilterCount = (type: FilterType): number => {
    switch (type) {
      case 'active':
        return downloads.filter(d => 
          d.status === 'downloading' || d.status === 'queued' || d.status === 'paused'
        ).length;
      case 'completed':
        return downloads.filter(d => d.status === 'completed').length;
      case 'failed':
        return downloads.filter(d => d.status === 'failed' || d.status === 'cancelled').length;
      default:
        return downloads.length;
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📥</Text>
      <Text style={styles.emptyTitle}>No Downloads Yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button or use the browser to start downloading files
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => setShowAddModal(true)}
      >
        <Text style={styles.emptyButtonText}>⚡ Add Download</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View>
      {/* Speed Meter */}
      <SpeedMeter speed={totalSpeed} activeCount={activeDownloads.length} />

      {/* Quick Actions */}
      {activeDownloads.length > 0 && (
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickAction} onPress={pauseAll}>
            <Text style={styles.quickActionText}>⏸ Pause All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickAction} onPress={resumeAll}>
            <Text style={styles.quickActionText}>▶ Resume All</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['all', 'active', 'completed', 'failed'] as FilterType[]).map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.filterTab, filter === type && styles.filterTabActive]}
            onPress={() => setFilter(type)}
          >
            <Text
              style={[
                styles.filterTabText,
                filter === type && styles.filterTabTextActive,
              ]}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
            <View
              style={[
                styles.filterBadge,
                filter === type && styles.filterBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.filterBadgeText,
                  filter === type && styles.filterBadgeTextActive,
                ]}
              >
                {getFilterCount(type)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <StatusBar barStyle="light-content" />
      
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.appTitle}>⚡ Turbo</Text>
          <Text style={styles.appSubtitle}>Download Manager</Text>
        </View>
        <View style={styles.headerActions}>
          {downloads.filter(d => d.status === 'completed').length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => {
                Alert.alert(
                  'Clear Completed',
                  'Remove all completed downloads from the list?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', onPress: clearCompleted },
                  ],
                );
              }}
            >
              <Text style={styles.clearBtnText}>Clear ✓</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filteredDownloads}
        keyExtractor={item => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        renderItem={({ item }) => (
          <DownloadCard
            download={item}
            onPause={() => pauseDownload(item.id)}
            onResume={() => resumeDownload(item.id)}
            onCancel={() => cancelDownload(item.id)}
            onRetry={() => retryDownload(item.id)}
            onDelete={() => handleDeleteDownload(item)}
            onOpen={() => handleOpenFile(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      />

      <AddDownloadModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onStartDownload={handleStartDownload}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.glow,
  },
  addButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: -2,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 4,
  },
  quickAction: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surfaceActive,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  filterBadgeActive: {
    backgroundColor: Colors.primary,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textTertiary,
  },
  filterBadgeTextActive: {
    color: Colors.textPrimary,
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    ...Shadows.glow,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});

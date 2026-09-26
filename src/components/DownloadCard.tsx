import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Colors, Shadows } from '../theme';
import { DownloadItem } from '../services/storage';
import { formatFileSize, formatSpeed, formatDuration, getCategoryColor } from '../utils/fileUtils';

interface Props {
  download: DownloadItem;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onOpen?: () => void;
}

export function DownloadCard({
  download,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDelete,
  onOpen,
}: Props) {
  const progressAnim = useRef(new Animated.Value(download.progress)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const categoryColor = getCategoryColor(download.category as any);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: download.progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [download.progress]);

  useEffect(() => {
    if (download.status === 'downloading') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [download.status]);

  const getStatusColor = () => {
    switch (download.status) {
      case 'downloading': return Colors.accent;
      case 'completed': return Colors.success;
      case 'paused': return Colors.warning;
      case 'failed': return Colors.error;
      case 'queued': return Colors.textTertiary;
      case 'cancelled': return Colors.textTertiary;
      default: return Colors.textSecondary;
    }
  };

  const getStatusText = () => {
    switch (download.status) {
      case 'downloading':
        const eta = download.speed > 0
          ? formatDuration((download.fileSize - download.downloadedSize) / download.speed)
          : '--:--';
        return `${formatSpeed(download.speed)} · ETA ${eta}`;
      case 'completed':
        return `${formatFileSize(download.fileSize)} · Completed`;
      case 'paused':
        return `Paused · ${formatFileSize(download.downloadedSize)} / ${formatFileSize(download.fileSize)}`;
      case 'failed':
        return download.error || 'Download failed';
      case 'queued':
        return 'Waiting in queue...';
      case 'cancelled':
        return 'Cancelled';
      default:
        return '';
    }
  };

  const getCategoryIcon = () => {
    switch (download.category) {
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'document': return '📄';
      case 'image': return '🖼️';
      case 'archive': return '📦';
      default: return '📁';
    }
  };

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: pulseAnim }] }]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={download.status === 'completed' ? onOpen : undefined}
        style={styles.touchable}
      >
        {/* Category indicator */}
        <View style={[styles.categoryIndicator, { backgroundColor: categoryColor }]} />
        
        <View style={styles.content}>
          {/* Header row */}
          <View style={styles.headerRow}>
            <Text style={styles.categoryIcon}>{getCategoryIcon()}</Text>
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>
                {download.fileName}
              </Text>
              <Text style={[styles.statusText, { color: getStatusColor() }]}>
                {getStatusText()}
              </Text>
            </View>
            
            {/* Percentage */}
            {download.status === 'downloading' && (
              <Text style={styles.percentage}>
                {Math.round(download.progress * 100)}%
              </Text>
            )}
          </View>

          {/* Progress bar */}
          {(download.status === 'downloading' || download.status === 'paused') && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: progressWidth,
                      backgroundColor: download.status === 'paused' ? Colors.warning : Colors.accent,
                    },
                  ]}
                />
                {download.status === 'downloading' && (
                  <Animated.View
                    style={[
                      styles.progressGlow,
                      {
                        width: progressWidth,
                      },
                    ]}
                  />
                )}
              </View>
              <Text style={styles.sizeText}>
                {formatFileSize(download.downloadedSize)} / {formatFileSize(download.fileSize)}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actions}>
            {download.status === 'downloading' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.pauseBtn]}
                onPress={onPause}
              >
                <Text style={styles.actionBtnText}>⏸ Pause</Text>
              </TouchableOpacity>
            )}
            
            {download.status === 'paused' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.resumeBtn]}
                onPress={onResume}
              >
                <Text style={styles.actionBtnText}>▶ Resume</Text>
              </TouchableOpacity>
            )}
            
            {download.status === 'failed' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.retryBtn]}
                onPress={onRetry}
              >
                <Text style={styles.actionBtnText}>🔄 Retry</Text>
              </TouchableOpacity>
            )}
            
            {download.status === 'completed' && onOpen && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.openBtn]}
                onPress={onOpen}
              >
                <Text style={styles.actionBtnText}>📂 Open</Text>
              </TouchableOpacity>
            )}
            
            {download.status !== 'completed' && download.status !== 'cancelled' && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={onCancel}
              >
                <Text style={[styles.actionBtnText, { color: Colors.error }]}>✕</Text>
              </TouchableOpacity>
            )}
            
            {(download.status === 'completed' || download.status === 'cancelled' || download.status === 'failed') && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.deleteBtn]}
                onPress={onDelete}
              >
                <Text style={[styles.actionBtnText, { color: Colors.error }]}>🗑</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
    ...Shadows.small,
  },
  touchable: {
    flexDirection: 'row',
  },
  categoryIndicator: {
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  content: {
    flex: 1,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  percentage: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.accent,
    fontFamily: 'Menlo',
    marginLeft: 8,
  },
  progressContainer: {
    marginTop: 10,
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressGlow: {
    position: 'absolute',
    top: -2,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(0, 210, 255, 0.2)',
  },
  sizeText: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 4,
    fontFamily: 'Menlo',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.surface,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  pauseBtn: {
    borderColor: 'rgba(255, 214, 0, 0.3)',
    backgroundColor: 'rgba(255, 214, 0, 0.1)',
  },
  resumeBtn: {
    borderColor: 'rgba(0, 210, 255, 0.3)',
    backgroundColor: 'rgba(0, 210, 255, 0.1)',
  },
  retryBtn: {
    borderColor: 'rgba(0, 210, 255, 0.3)',
    backgroundColor: 'rgba(0, 210, 255, 0.1)',
  },
  openBtn: {
    borderColor: 'rgba(0, 230, 118, 0.3)',
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
  },
  cancelBtn: {
    borderColor: 'rgba(255, 82, 82, 0.2)',
    backgroundColor: 'rgba(255, 82, 82, 0.08)',
  },
  deleteBtn: {
    borderColor: 'rgba(255, 82, 82, 0.2)',
    backgroundColor: 'rgba(255, 82, 82, 0.08)',
  },
});

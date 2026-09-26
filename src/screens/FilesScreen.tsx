import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Colors, Shadows } from '../theme';
import { formatFileSize, formatDate, getFileCategory, getCategoryColor } from '../utils/fileUtils';
import type { FileCategory } from '../utils/fileUtils';

interface FileItem {
  name: string;
  path: string;
  size: number;
  lastModified: string;
  category: FileCategory;
}

type SortType = 'date' | 'name' | 'size';

const CATEGORY_FILTERS: { key: FileCategory | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '📁' },
  { key: 'video', label: 'Video', icon: '🎬' },
  { key: 'audio', label: 'Audio', icon: '🎵' },
  { key: 'image', label: 'Images', icon: '🖼️' },
  { key: 'document', label: 'Docs', icon: '📄' },
  { key: 'archive', label: 'Archives', icon: '📦' },
];

export function FilesScreen() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<FileCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortType>('date');
  const [refreshing, setRefreshing] = useState(false);
  const [totalSize, setTotalSize] = useState(0);

  const loadFiles = useCallback(async () => {
    try {
      const { dirs } = ReactNativeBlobUtil.fs;
      const downloadDir = Platform.OS === 'ios' ? dirs.DocumentDir : dirs.DownloadDir;
      const dirPath = `${downloadDir}/TurboDownloader`;

      const dirExists = await ReactNativeBlobUtil.fs.isDir(dirPath);
      if (!dirExists) {
        setFiles([]);
        setFilteredFiles([]);
        setTotalSize(0);
        return;
      }

      const fileList = await ReactNativeBlobUtil.fs.ls(dirPath);
      const fileItems: FileItem[] = [];

      for (const fileName of fileList) {
        try {
          const filePath = `${dirPath}/${fileName}`;
          const stat = await ReactNativeBlobUtil.fs.stat(filePath);
          const category = getFileCategory(fileName);

          fileItems.push({
            name: fileName,
            path: filePath,
            size: Number(stat.size),
            lastModified: String(stat.lastModified || new Date().toISOString()),
            category,
          });
        } catch (e) {
          // Skip files we can't stat
        }
      }

      setFiles(fileItems);
      setTotalSize(fileItems.reduce((sum, f) => sum + f.size, 0));
    } catch (error) {
      console.error('Error loading files:', error);
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    let result = [...files];

    // Filter
    if (selectedCategory !== 'all') {
      result = result.filter(f => f.category === selectedCategory);
    }

    // Sort
    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'size':
        result.sort((a, b) => b.size - a.size);
        break;
      case 'date':
      default:
        result.sort((a, b) => 
          new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
        );
        break;
    }

    setFilteredFiles(result);
  }, [files, selectedCategory, sortBy]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFiles();
    setRefreshing(false);
  }, [loadFiles]);

  const handleOpenFile = async (file: FileItem) => {
    try {
      if (Platform.OS === 'ios') {
        ReactNativeBlobUtil.ios.openDocument(file.path);
      } else {
        ReactNativeBlobUtil.android.actionViewIntent(file.path, '*/*');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open the file.');
    }
  };

  const handleShareFile = async (file: FileItem) => {
    try {
      if (Platform.OS === 'ios') {
        ReactNativeBlobUtil.ios.openDocument(file.path);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not share the file.');
    }
  };

  const handleDeleteFile = (file: FileItem) => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${file.name}"?\n\nSize: ${formatFileSize(file.size)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ReactNativeBlobUtil.fs.unlink(file.path);
              await loadFiles();
            } catch (error) {
              Alert.alert('Error', 'Could not delete the file.');
            }
          },
        },
      ],
    );
  };

  const getCategoryItemCount = (category: FileCategory | 'all'): number => {
    if (category === 'all') return files.length;
    return files.filter(f => f.category === category).length;
  };

  const getCategoryEmoji = (category: FileCategory): string => {
    switch (category) {
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'document': return '📄';
      case 'image': return '🖼️';
      case 'archive': return '📦';
      default: return '📁';
    }
  };

  const renderFileItem = ({ item }: { item: FileItem }) => {
    const categoryColor = getCategoryColor(item.category);

    return (
      <TouchableOpacity
        style={styles.fileCard}
        onPress={() => handleOpenFile(item)}
        onLongPress={() => {
          Alert.alert(item.name, `Size: ${formatFileSize(item.size)}`, [
            { text: 'Open', onPress: () => handleOpenFile(item) },
            { text: 'Share', onPress: () => handleShareFile(item) },
            { text: 'Delete', style: 'destructive', onPress: () => handleDeleteFile(item) },
            { text: 'Cancel', style: 'cancel' },
          ]);
        }}
        activeOpacity={0.7}
      >
        <View style={[styles.fileCategoryIndicator, { backgroundColor: categoryColor }]} />
        <View style={styles.fileIcon}>
          <Text style={styles.fileIconText}>{getCategoryEmoji(item.category)}</Text>
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.fileMeta}>
            <Text style={styles.fileSize}>{formatFileSize(item.size)}</Text>
            <Text style={styles.fileDot}>·</Text>
            <Text style={styles.fileDate}>{formatDate(item.lastModified)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.fileActionBtn}
          onPress={() => handleDeleteFile(item)}
        >
          <Text style={styles.fileActionText}>🗑</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View>
      {/* Storage stats */}
      <View style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{files.length}</Text>
            <Text style={styles.statLabel}>Files</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatFileSize(totalSize)}</Text>
            <Text style={styles.statLabel}>Total Size</Text>
          </View>
        </View>
      </View>

      {/* Category filters */}
      <FlatList
        horizontal
        data={CATEGORY_FILTERS}
        keyExtractor={item => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryList}
        renderItem={({ item }) => {
          const count = getCategoryItemCount(item.key);
          const isActive = selectedCategory === item.key;
          return (
            <TouchableOpacity
              style={[styles.categoryChip, isActive && styles.categoryChipActive]}
              onPress={() => setSelectedCategory(item.key)}
            >
              <Text style={styles.categoryChipIcon}>{item.icon}</Text>
              <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                {item.label}
              </Text>
              <View style={[styles.categoryChipBadge, isActive && styles.categoryChipBadgeActive]}>
                <Text style={[styles.categoryChipCount, isActive && styles.categoryChipCountActive]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* Sort options */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        {(['date', 'name', 'size'] as SortType[]).map(type => (
          <TouchableOpacity
            key={type}
            style={[styles.sortOption, sortBy === type && styles.sortOptionActive]}
            onPress={() => setSortBy(type)}
          >
            <Text style={[styles.sortOptionText, sortBy === type && styles.sortOptionTextActive]}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📂</Text>
      <Text style={styles.emptyTitle}>No Files Found</Text>
      <Text style={styles.emptySubtitle}>
        {selectedCategory !== 'all'
          ? `No ${selectedCategory} files downloaded yet`
          : 'Downloaded files will appear here'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>📂 Files</Text>
          <Text style={styles.headerSubtitle}>Manage your downloads</Text>
        </View>
      </View>

      <FlatList
        data={filteredFiles}
        keyExtractor={item => item.path}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        renderItem={renderFileItem}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
    marginTop: 1,
  },
  statsCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: 16,
    ...Shadows.small,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.border,
  },
  categoryList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  categoryChipIcon: {
    fontSize: 14,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  categoryChipTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  categoryChipBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.surfaceActive,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  categoryChipBadgeActive: {
    backgroundColor: Colors.primary,
  },
  categoryChipCount: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textTertiary,
  },
  categoryChipCountActive: {
    color: Colors.textPrimary,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  sortLabel: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortOptionActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  sortOptionText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  sortOptionTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 100,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
  },
  fileCategoryIndicator: {
    width: 3,
    alignSelf: 'stretch',
  },
  fileIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  fileIconText: {
    fontSize: 22,
  },
  fileInfo: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  fileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fileSize: {
    fontSize: 12,
    color: Colors.textTertiary,
    fontWeight: '500',
  },
  fileDot: {
    fontSize: 10,
    color: Colors.textTertiary,
  },
  fileDate: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  fileActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  fileActionText: {
    fontSize: 16,
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
  },
});

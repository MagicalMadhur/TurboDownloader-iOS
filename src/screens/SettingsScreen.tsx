import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Colors, Shadows } from '../theme';
import { useDownloads } from '../context/DownloadContext';
import { storage } from '../services/storage';
import { formatFileSize } from '../utils/fileUtils';

export function SettingsScreen() {
  const { settings, updateSettings } = useDownloads();
  const [storageInfo, setStorageInfo] = useState<string>('Calculating...');

  React.useEffect(() => {
    calculateStorage();
  }, []);

  const calculateStorage = async () => {
    try {
      const { dirs } = ReactNativeBlobUtil.fs;
      const downloadDir = Platform.OS === 'ios' ? dirs.DocumentDir : dirs.DownloadDir;
      const dirPath = `${downloadDir}/TurboDownloader`;

      const dirExists = await ReactNativeBlobUtil.fs.isDir(dirPath);
      if (!dirExists) {
        setStorageInfo('0 B used');
        return;
      }

      const fileList = await ReactNativeBlobUtil.fs.ls(dirPath);
      let totalSize = 0;

      for (const fileName of fileList) {
        try {
          const stat = await ReactNativeBlobUtil.fs.stat(`${dirPath}/${fileName}`);
          totalSize += Number(stat.size);
        } catch (e) {}
      }

      setStorageInfo(`${formatFileSize(totalSize)} used (${fileList.length} files)`);
    } catch (error) {
      setStorageInfo('Unable to calculate');
    }
  };

  const handleClearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all download records, bookmarks, and browser history. Downloaded files will NOT be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await storage.clearAll();
            Alert.alert('Done', 'All app data has been cleared.');
          },
        },
      ],
    );
  };

  const handleDeleteAllFiles = () => {
    Alert.alert(
      'Delete All Downloads',
      'This will permanently delete ALL downloaded files from your device. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              const { dirs } = ReactNativeBlobUtil.fs;
              const downloadDir = Platform.OS === 'ios' ? dirs.DocumentDir : dirs.DownloadDir;
              const dirPath = `${downloadDir}/TurboDownloader`;
              
              const exists = await ReactNativeBlobUtil.fs.isDir(dirPath);
              if (exists) {
                await ReactNativeBlobUtil.fs.unlink(dirPath);
                await ReactNativeBlobUtil.fs.mkdir(dirPath);
              }
              
              await calculateStorage();
              Alert.alert('Done', 'All downloaded files have been deleted.');
            } catch (error) {
              Alert.alert('Error', 'Could not delete files.');
            }
          },
        },
      ],
    );
  };

  const SettingRow = ({
    icon,
    title,
    subtitle,
    children,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    children?: React.ReactNode;
  }) => (
    <View style={styles.settingRow}>
      <Text style={styles.settingIcon}>{icon}</Text>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={styles.sectionHeader}>{title}</Text>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>⚙️ Settings</Text>
        <Text style={styles.headerSubtitle}>Customize your experience</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* App Info */}
        <View style={styles.appInfoCard}>
          <Text style={styles.appLogo}>⚡</Text>
          <Text style={styles.appName}>Turbo Downloader</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <View style={styles.appBadges}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🚀 High Speed</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>🛡 Ad-Free</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>⏬ Background</Text>
            </View>
          </View>
        </View>

        {/* Downloads Section */}
        <SectionHeader title="DOWNLOADS" />
        <View style={styles.section}>
          <SettingRow
            icon="⚡"
            title="Max Simultaneous Downloads"
            subtitle={`Currently: ${settings.maxSimultaneousDownloads} downloads`}
          >
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() =>
                  updateSettings({
                    maxSimultaneousDownloads: Math.max(1, settings.maxSimultaneousDownloads - 1),
                  })
                }
              >
                <Text style={styles.stepperBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{settings.maxSimultaneousDownloads}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() =>
                  updateSettings({
                    maxSimultaneousDownloads: Math.min(8, settings.maxSimultaneousDownloads + 1),
                  })
                }
              >
                <Text style={styles.stepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </SettingRow>

          <View style={styles.divider} />

          <SettingRow
            icon="📶"
            title="Wi-Fi Only Downloads"
            subtitle="Only download when connected to Wi-Fi"
          >
            <Switch
              value={settings.wifiOnly}
              onValueChange={(value) => updateSettings({ wifiOnly: value })}
              trackColor={{ false: Colors.surface, true: Colors.primary }}
              thumbColor={Colors.textPrimary}
            />
          </SettingRow>

          <View style={styles.divider} />

          <SettingRow
            icon="🔄"
            title="Auto Retry"
            subtitle="Automatically retry failed downloads"
          >
            <Switch
              value={settings.autoRetry}
              onValueChange={(value) => updateSettings({ autoRetry: value })}
              trackColor={{ false: Colors.surface, true: Colors.primary }}
              thumbColor={Colors.textPrimary}
            />
          </SettingRow>

          <View style={styles.divider} />

          <SettingRow
            icon="🔔"
            title="Download Notifications"
            subtitle="Show notifications for download progress"
          >
            <Switch
              value={settings.showNotifications}
              onValueChange={(value) => updateSettings({ showNotifications: value })}
              trackColor={{ false: Colors.surface, true: Colors.primary }}
              thumbColor={Colors.textPrimary}
            />
          </SettingRow>
        </View>

        {/* Browser Section */}
        <SectionHeader title="BROWSER" />
        <View style={styles.section}>
          <SettingRow
            icon="🛡"
            title="Ad Blocker"
            subtitle="Block ads and trackers for faster browsing"
          >
            <Switch
              value={settings.adBlockEnabled}
              onValueChange={(value) => updateSettings({ adBlockEnabled: value })}
              trackColor={{ false: Colors.surface, true: Colors.success }}
              thumbColor={Colors.textPrimary}
            />
          </SettingRow>

          <View style={styles.divider} />

          <SettingRow
            icon="🔍"
            title="Search Engine"
            subtitle={settings.defaultSearchEngine.charAt(0).toUpperCase() + settings.defaultSearchEngine.slice(1)}
          >
            <View style={styles.searchEngineOptions}>
              {(['google', 'duckduckgo', 'bing'] as const).map(engine => (
                <TouchableOpacity
                  key={engine}
                  style={[
                    styles.engineOption,
                    settings.defaultSearchEngine === engine && styles.engineOptionActive,
                  ]}
                  onPress={() => updateSettings({ defaultSearchEngine: engine })}
                >
                  <Text style={[
                    styles.engineOptionText,
                    settings.defaultSearchEngine === engine && styles.engineOptionTextActive,
                  ]}>
                    {engine === 'google' ? '🔵' : engine === 'duckduckgo' ? '🦆' : '🟦'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </SettingRow>
        </View>

        {/* Storage Section */}
        <SectionHeader title="STORAGE" />
        <View style={styles.section}>
          <SettingRow
            icon="💾"
            title="Storage Used"
            subtitle={storageInfo}
          />

          <View style={styles.divider} />

          <TouchableOpacity onPress={() => storage.clearHistory()}>
            <SettingRow
              icon="🧹"
              title="Clear Browser History"
              subtitle="Remove all browsing history"
            />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity onPress={handleClearAllData}>
            <SettingRow
              icon="🗑"
              title="Clear App Data"
              subtitle="Remove all records, bookmarks, and history"
            />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity onPress={handleDeleteAllFiles}>
            <SettingRow
              icon="⚠️"
              title="Delete All Downloaded Files"
              subtitle="Permanently remove all files from device"
            />
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <SectionHeader title="ABOUT" />
        <View style={styles.section}>
          <SettingRow
            icon="⚡"
            title="Turbo Downloader"
            subtitle="High-speed download manager for iOS"
          />
          <View style={styles.divider} />
          <SettingRow
            icon="📱"
            title="Platform"
            subtitle={`${Platform.OS} ${Platform.Version}`}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Made with ❤️ for fast downloads</Text>
          <Text style={styles.footerVersion}>v1.0.0 · React Native</Text>
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  appInfoCard: {
    margin: 16,
    borderRadius: 20,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    padding: 24,
    alignItems: 'center',
    ...Shadows.medium,
  },
  appLogo: {
    fontSize: 48,
    marginBottom: 8,
  },
  appName: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 13,
    color: Colors.textTertiary,
    fontWeight: '500',
    marginBottom: 16,
  },
  appBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textTertiary,
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  section: {
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  settingIcon: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  settingSubtitle: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 58,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 20,
    textAlign: 'center',
  },
  searchEngineOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  engineOption: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  engineOptionActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  engineOptionText: {
    fontSize: 16,
  },
  engineOptionTextActive: {},
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginBottom: 4,
  },
  footerVersion: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
});

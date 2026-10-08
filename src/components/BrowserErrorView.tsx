import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../theme';

interface Props {
  errorDomain?: string;
  errorCode?: number;
  errorDescription?: string;
  failingUrl: string;
  onRetry: () => void;
  onGoBack: () => void;
  onGoHome: () => void;
  onDirectDownload?: (url: string) => void;
}

export function BrowserErrorView({
  errorDomain,
  errorCode,
  errorDescription,
  failingUrl,
  onRetry,
  onGoBack,
  onGoHome,
  onDirectDownload,
}: Props) {
  // Determine friendly user-facing reason based on error code/domain
  const getFriendlyMessage = (): { title: string; subtitle: string; icon: string } => {
    const code = errorCode || 0;
    const desc = (errorDescription || '').toLowerCase();

    if (code === -1003 || desc.includes('cannot find host') || desc.includes('nodename nor servname')) {
      return {
        icon: '🔍⚠️',
        title: 'Server Not Found',
        subtitle: 'The server address could not be reached. The download mirror or site may be offline, moved, or expired.',
      };
    }

    if (code === -1004 || desc.includes('cannot connect') || desc.includes('connection refused')) {
      return {
        icon: '🔌❌',
        title: 'Connection Refused',
        subtitle: 'The destination server is not responding. It may be overloaded or temporarily down.',
      };
    }

    if (code === -1001 || desc.includes('timed out') || desc.includes('timeout')) {
      return {
        icon: '⏳⚠️',
        title: 'Connection Timed Out',
        subtitle: 'The server took too long to respond. Please check your internet connection or try again later.',
      };
    }

    if (code === -1200 || code === -1202 || desc.includes('ssl') || desc.includes('certificate')) {
      return {
        icon: '🔒⚠️',
        title: 'Security Connection Error',
        subtitle: 'A secure SSL/TLS connection could not be established with this site.',
      };
    }

    if (code === -1009 || desc.includes('not connected to internet') || desc.includes('offline')) {
      return {
        icon: '📡❌',
        title: 'No Internet Connection',
        subtitle: 'Your device appears to be offline. Please check your Wi-Fi or mobile data.',
      };
    }

    return {
      icon: '🌐⚠️',
      title: 'Unable to Load Page',
      subtitle: errorDescription || 'This link encountered an issue and could not be loaded by the server.',
    };
  };

  const friendly = getFriendlyMessage();
  const lowerUrl = (failingUrl || '').toLowerCase();
  const looksLikeDownload =
    lowerUrl.includes('.mp4') ||
    lowerUrl.includes('.mkv') ||
    lowerUrl.includes('.zip') ||
    lowerUrl.includes('/download/') ||
    lowerUrl.includes('/file/') ||
    lowerUrl.includes('drive.');

  // Clean domain display
  let domainDisplay = failingUrl;
  try {
    const parsed = new URL(failingUrl);
    domainDisplay = parsed.hostname;
  } catch {}

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>{friendly.icon}</Text>
        <Text style={styles.title}>{friendly.title}</Text>
        <Text style={styles.subtitle}>{friendly.subtitle}</Text>

        {/* Destination URL Box */}
        <View style={styles.urlBox}>
          <Text style={styles.urlLabel}>Attempted Address:</Text>
          <Text style={styles.urlText} numberOfLines={2} ellipsizeMode="middle">
            {failingUrl || 'Unknown URL'}
          </Text>
          {errorCode !== undefined && errorCode !== 0 && (
            <Text style={styles.errorCodeText}>
              Error code: {errorCode} ({errorDomain || 'WebKit'})
            </Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.retryBtn]} onPress={onRetry} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>🔄 Try Again</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.backBtn]} onPress={onGoBack} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>‹ Go Back</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.homeBtn]} onPress={onGoHome} activeOpacity={0.8}>
            <Text style={styles.homeBtnText}>🏠 Home</Text>
          </TouchableOpacity>
        </View>

        {/* Optional: TurboDownloader Direct Fetch if it looks like a media download */}
        {looksLikeDownload && onDirectDownload && (
          <TouchableOpacity
            style={styles.directDownloadBtn}
            onPress={() => onDirectDownload(failingUrl)}
            activeOpacity={0.85}
          >
            <Text style={styles.directDownloadIcon}>⚡</Text>
            <View style={styles.directDownloadTextWrap}>
              <Text style={styles.directDownloadTitle}>Try Turbo Downloader</Text>
              <Text style={styles.directDownloadSubtitle}>
                Attempt direct multi-threaded engine fetch for this stream/file
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#13151F',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  icon: {
    fontSize: 48,
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  urlBox: {
    width: '100%',
    backgroundColor: '#0B0D14',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  urlLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  urlText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: 'Courier',
  },
  errorCodeText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.primary,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  backBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  homeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    flex: 0.8,
  },
  homeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  directDownloadBtn: {
    marginTop: 16,
    width: '100%',
    backgroundColor: 'rgba(0, 242, 254, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  directDownloadIcon: {
    fontSize: 22,
  },
  directDownloadTextWrap: {
    flex: 1,
  },
  directDownloadTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.accent,
  },
  directDownloadSubtitle: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 1,
  },
});

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Animated,
  Keyboard,
  ActivityIndicator,
  Share,
  BackHandler,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Colors, Shadows } from '../theme';
import { useDownloads } from '../context/DownloadContext';
import { storage, Bookmark } from '../services/storage';
import { isValidUrl, isDownloadableUrl, normalizeUrl } from '../utils/fileUtils';
import { AD_HIDE_CSS, AD_BLOCK_JS, shouldBlockUrl } from '../utils/adBlocker';
import { AddDownloadModal } from '../components/AddDownloadModal';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { BrowserErrorView } from '../components/BrowserErrorView';

const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
};

const DEFAULT_HOME = 'https://duckduckgo.com/';

export function BrowserScreen() {
  const { startDownload, settings } = useDownloads();
  const webViewRef = useRef<any>(null);
  const urlInputRef = useRef<any>(null);

  // sourceUri is explicitly requested by user (prevents React from aborting in-flight 302 redirects)
  const [sourceUri, setSourceUri] = useState(DEFAULT_HOME);
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_HOME);
  const [urlBarText, setUrlBarText] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUrlFocused, setIsUrlFocused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [pendingDownloadUrl, setPendingDownloadUrl] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const [detectedMedia, setDetectedMedia] = useState<{ url: string; title: string }[]>([]);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  const terminateCountRef = useRef(0);
  const lastTerminateTimeRef = useRef(0);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(0)).current;

  const showToast = (message: string) => {
    setDownloadToast(message);
    Animated.sequence([
      Animated.timing(toastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(toastAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => setDownloadToast(null));
  };

  useEffect(() => {
    loadBookmarks();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const loadBookmarks = async () => {
    const saved = await storage.getBookmarks();
    setBookmarks(saved);
  };

  const getSearchUrl = (query: string): string => {
    const engine = settings.defaultSearchEngine || 'google';
    return SEARCH_ENGINES[engine] + encodeURIComponent(query);
  };

  const navigateToUrl = (input: string) => {
    Keyboard.dismiss();
    const trimmed = input.trim();
    if (!trimmed) return;

    let url: string;
    if (isValidUrl(trimmed)) {
      url = trimmed;
    } else if (trimmed.includes('.') && !trimmed.includes(' ')) {
      url = `https://${trimmed}`;
    } else {
      url = getSearchUrl(trimmed);
    }

    setSourceUri(url);
    setCurrentUrl(url);
    setUrlBarText(url);
    setIsUrlFocused(false);
  };

  const handleNavigationChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    if (navState.url) {
      if (navState.url !== currentUrl) {
        setDetectedMedia([]);
      }
      setCurrentUrl(navState.url);
      if (!isUrlFocused) {
        setUrlBarText(navState.url);
      }
    }
    if (navState.title) {
      setPageTitle(navState.title);
    }

    // Add to history safely
    if (navState.url && navState.title) {
      storage
        .addToHistory({
          url: navState.url,
          title: navState.title,
          visitedAt: new Date().toISOString(),
        })
        .catch(err => {
          console.warn('[BrowserScreen] addToHistory error:', err);
        });
    }
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'MEDIA_DETECTED' && data.url) {
        const safeUrl = normalizeUrl(data.url);
        setDetectedMedia(prev => {
          if (prev.some(m => m.url === safeUrl)) return prev;
          return [...prev, { url: safeUrl, title: data.title || pageTitle || 'Video' }];
        });
      } else if (data.type === 'DOWNLOAD_CLICKED' && data.url) {
        const safeUrl = normalizeUrl(data.url);
        setPendingDownloadUrl(safeUrl);
        setShowDownloadModal(true);
      }
    } catch (e) {}
  };

  const handleShouldStartLoad = (event: any): boolean => {
    try {
      const { url, isTopFrame, target, navigationType } = event;
      if (!url) return false;

      const lower = url.toLowerCase();

      // 1. Allow internal browser frames, workers, and data URIs essential for Turnstile / modern web apps
      if (
        lower.startsWith('about:blank') ||
        lower.startsWith('about:srcdoc') ||
        lower.startsWith('blob:') ||
        lower.startsWith('data:image/') ||
        lower.startsWith('data:font/') ||
        lower.startsWith('data:application/') ||
        lower.startsWith('data:text/css') ||
        (lower.startsWith('about:') && isTopFrame)
      ) {
        return true;
      }

      // 2. Safe handling of non-HTTP protocols (prevents native iOS WebKit unhandled scheme crashes)
      if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
        // Handle Magnet torrent links gracefully
        if (lower.startsWith('magnet:')) {
          try {
            const { Clipboard } = require('react-native');
            if (Clipboard && Clipboard.setString) {
              Clipboard.setString(url);
            }
            setTimeout(() => {
              showToast('📋 Magnet link copied to clipboard');
            }, 10);
          } catch {}
          return false;
        }

        // Safe external app links (mailto, tel)
        if (lower.startsWith('mailto:') || lower.startsWith('tel:')) {
          try {
            Linking.openURL(url).catch(() => {});
          } catch {}
          return false;
        }

        // Silently ignore other custom schemes without calling Linking
        // (prevents OSStatus error -10814 native crashes on iOS for unknown schemes)
        return false;
      }

      // 3. ALWAYS allow Cloudflare Turnstile, hCaptcha, challenge platform & clearance tokens
      const isChallengeUrl =
        lower.includes('cdn-cgi/challenge') ||
        lower.includes('challenge-platform') ||
        lower.includes('__cf_chl_') ||
        lower.includes('cloudflare.com') ||
        lower.includes('challenges.cloudflare.com') ||
        lower.includes('cloudflareinsights.com') ||
        lower.includes('hcaptcha.com') ||
        lower.includes('recaptcha') ||
        lower.includes('gstatic.com') ||
        lower.includes('arkoselabs') ||
        lower.includes('geetest');

      if (isChallengeUrl) {
        return true;
      }

      const safeUrl = normalizeUrl(url);

      // 4. Block known ad networks, trackers, and popup redirect domains
      if (settings.adBlockEnabled && (shouldBlockUrl(url) || shouldBlockUrl(safeUrl))) {
        setTimeout(() => {
          setBlockedCount(prev => prev + 1);
        }, 10);
        return false;
      }

      // 5. Check if it's a direct downloadable media/archive file
      if (isDownloadableUrl(safeUrl)) {
        setTimeout(() => {
          setPendingDownloadUrl(safeUrl);
          setShowDownloadModal(true);
        }, 10);
        return false;
      }

      // 6. Smart Popup / Popunder / Tab-under protection:
      if (settings.adBlockEnabled && currentUrl && currentUrl.startsWith('http')) {
        try {
          const currentHost = new URL(normalizeUrl(currentUrl)).hostname.replace(/^www\./, '');
          const targetHost = new URL(safeUrl).hostname.replace(/^www\./, '');

          // If navigating to a different domain
          if (targetHost && targetHost !== currentHost) {
            const isTrustedMediaHost = 
              targetHost.includes('drive.google.com') ||
              targetHost.includes('mediafire.com') ||
              targetHost.includes('mega.nz') ||
              targetHost.includes('mega.co.nz') ||
              targetHost.includes('pixeldrain.com') ||
              targetHost.includes('gofile.io') ||
              targetHost.includes('hubcloud') ||
              targetHost.includes('hubdrive') ||
              targetHost.includes('gdflix') ||
              targetHost.includes('gdriveplayer') ||
              targetHost.includes('fastdl') ||
              targetHost.includes('1cloud') ||
              targetHost.includes('streamtape') ||
              targetHost.includes('streamhide') ||
              targetHost.includes('streamsilk') ||
              targetHost.includes('streamwish') ||
              targetHost.includes('streamhub') ||
              targetHost.includes('doodstream') ||
              targetHost.includes('dood.') ||
              targetHost.includes('doodvideo') ||
              targetHost.includes('ds2play') ||
              targetHost.includes('dropbox.com') ||
              targetHost.includes('terabox.com') ||
              targetHost.includes('1024tera') ||
              targetHost.includes('nephobox') ||
              targetHost.includes('katfile.com') ||
              targetHost.includes('rapidgator.net') ||
              targetHost.includes('krakenfiles.com') ||
              targetHost.includes('hexupload') ||
              targetHost.includes('vidsrc.') ||
              targetHost.includes('vidcloud.') ||
              targetHost.includes('vidplay') ||
              targetHost.includes('vidmoly') ||
              targetHost.includes('mixdrop.') ||
              targetHost.includes('filemoon.') ||
              targetHost.includes('upstream.') ||
              targetHost.includes('mp4upload') ||
              targetHost.includes('github.com');

            const isSearchOrHome = 
              targetHost.includes('google.') || 
              targetHost.includes('duckduckgo.') || 
              targetHost.includes('bing.');

            // Subdomains of current host are allowed (e.g. m.yomovies.ac or api.yomovies.ac)
            const isSubdomain = targetHost.endsWith('.' + currentHost) || currentHost.endsWith('.' + targetHost);

            if (!isSubdomain) {
              // A. Sub-iframe navigation to unknown third-party domain: BLOCK
              if (!isTopFrame && !isTrustedMediaHost) {
                setTimeout(() => {
                  setBlockedCount(prev => prev + 1);
                }, 10);
                return false;
              }

              // B. Script-triggered background popunders (window.location / meta refresh / clickjack): BLOCK
              if (navigationType === 'other' && !isTrustedMediaHost && !isDownloadableUrl(safeUrl) && !isSearchOrHome) {
                setTimeout(() => {
                  setBlockedCount(prev => prev + 1);
                }, 10);
                return false;
              }

              // C. If user clicked, but the destination is an ad / betting / tracking site: BLOCK
              if (shouldBlockUrl(url) || shouldBlockUrl(safeUrl)) {
                setTimeout(() => {
                  setBlockedCount(prev => prev + 1);
                }, 10);
                return false;
              }

              // D. If user clicked on a movie site and it tries to open a suspicious TLD ad popunder: BLOCK
              const suspiciousAdTld = /\.(xyz|top|bid|click|live|today|club|online|work|cfd|sbs|bond)(\/|$)/i.test(targetHost);
              if (suspiciousAdTld && !isTrustedMediaHost) {
                setTimeout(() => {
                  setBlockedCount(prev => prev + 1);
                }, 10);
                return false;
              }
            }
          }
        } catch (e) {}
      }

      return true;
    } catch (err) {
      console.warn('[BrowserScreen] handleShouldStartLoad safe fallback:', err);
      return true;
    }
  };

  const handleDownload = async (url: string, fileName?: string) => {
    try {
      const safeUrl = normalizeUrl(url);
      startDownload(safeUrl, fileName);
      showToast(`⚡ Started: ${fileName || 'File'}`);
    } catch (err: any) {
      showToast(`❌ ${err?.message || 'Could not start download'}`);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        url: currentUrl,
        message: `${pageTitle}\n${currentUrl}`,
      });
    } catch (error) {
      // User cancelled share
    }
  };

  const handleAddBookmark = async () => {
    const existing = bookmarks.find(b => b.url === currentUrl);
    if (existing) {
      Alert.alert('Already Bookmarked', 'This page is already in your bookmarks.');
      return;
    }

    const bookmark: Bookmark = {
      id: `bm_${Date.now()}`,
      title: pageTitle || currentUrl,
      url: currentUrl,
      createdAt: new Date().toISOString(),
    };

    await storage.addBookmark(bookmark);
    await loadBookmarks();
    Alert.alert('Bookmarked! 🔖', `"${pageTitle}" added to bookmarks.`);
  };

  const handleRemoveBookmark = async (id: string) => {
    await storage.removeBookmark(id);
    await loadBookmarks();
  };

  const isBookmarked = bookmarks.some(b => b.url === currentUrl);

  // Inject ad-blocking CSS and JS
  const injectedCSS = settings.adBlockEnabled ? AD_HIDE_CSS : '';
  const injectedJS = settings.adBlockEnabled ? AD_BLOCK_JS : 'true;';

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <ErrorBoundary
      fallbackMessage="The browser encountered an error on this page, but your downloads are safe."
      onReset={() => webViewRef.current?.reload()}
    >
      <SafeAreaView style={styles.screen} edges={['top']}>
      {/* URL Bar */}
      <View style={styles.toolbar}>
        <View style={styles.navButtons}>
          <TouchableOpacity
            style={[styles.navBtn, !canGoBack && styles.navBtnDisabled]}
            onPress={() => webViewRef.current?.goBack()}
            disabled={!canGoBack}
          >
            <Text style={[styles.navBtnText, !canGoBack && styles.navBtnTextDisabled]}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navBtn, !canGoForward && styles.navBtnDisabled]}
            onPress={() => webViewRef.current?.goForward()}
            disabled={!canGoForward}
          >
            <Text style={[styles.navBtnText, !canGoForward && styles.navBtnTextDisabled]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.urlBar, isUrlFocused && styles.urlBarFocused]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.urlIcon} />
          ) : (
            <Text style={styles.urlIcon}>
              {currentUrl.startsWith('https') ? '🔒' : '🌐'}
            </Text>
          )}
          <TextInput
            ref={urlInputRef}
            style={styles.urlInput}
            value={isUrlFocused ? urlBarText : currentUrl}
            onChangeText={setUrlBarText}
            onFocus={() => {
              setIsUrlFocused(true);
              setUrlBarText(currentUrl);
            }}
            onBlur={() => setIsUrlFocused(false)}
            onSubmitEditing={() => navigateToUrl(urlBarText)}
            placeholder="Search or enter URL..."
            placeholderTextColor={Colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="go"
            selectTextOnFocus
            selectionColor={Colors.primary}
          />
          {isLoading && (
            <TouchableOpacity
              onPress={() => webViewRef.current?.stopLoading()}
              style={styles.stopBtn}
            >
              <Text style={styles.stopBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.menuBtn} onPress={() => setShowBookmarks(!showBookmarks)}>
          <Text style={styles.menuBtnText}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* Progress bar */}
      {isLoading && (
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
      )}



      {/* Ad block badge */}
      {settings.adBlockEnabled && blockedCount > 0 && (
        <View style={styles.adBlockBadge}>
          <Text style={styles.adBlockText}>🛡 {blockedCount} ads blocked</Text>
        </View>
      )}

      {/* Bookmarks panel */}
      {showBookmarks && (
        <View style={styles.bookmarksPanel}>
          <View style={styles.bookmarksHeader}>
            <Text style={styles.bookmarksTitle}>🔖 Bookmarks</Text>
            <TouchableOpacity onPress={handleAddBookmark}>
              <Text style={styles.addBookmarkText}>
                {isBookmarked ? '★ Saved' : '☆ Add'}
              </Text>
            </TouchableOpacity>
          </View>
          {bookmarks.length === 0 ? (
            <Text style={styles.noBookmarks}>No bookmarks yet</Text>
          ) : (
            bookmarks.slice(0, 8).map(bm => (
              <TouchableOpacity
                key={bm.id}
                style={styles.bookmarkItem}
                onPress={() => {
                  navigateToUrl(bm.url);
                  setShowBookmarks(false);
                }}
                onLongPress={() => {
                  Alert.alert('Remove Bookmark?', bm.title, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => handleRemoveBookmark(bm.id),
                    },
                  ]);
                }}
              >
                <Text style={styles.bookmarkTitle} numberOfLines={1}>{bm.title}</Text>
                <Text style={styles.bookmarkUrl} numberOfLines={1}>{bm.url}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ uri: sourceUri }}
        style={styles.webview}
        originWhitelist={['*']}
        onNavigationStateChange={handleNavigationChange}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onMessage={handleWebViewMessage}
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          // Ignore -999 (cancelled during normal redirect)
          if (nativeEvent?.code === -999) return;
          console.warn('[WebView Error]', nativeEvent?.description || nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.warn('[WebView HttpError]', nativeEvent?.statusCode);
        }}
        onContentProcessDidTerminate={() => {
          const now = Date.now();
          if (now - lastTerminateTimeRef.current < 4000) {
            terminateCountRef.current += 1;
          } else {
            terminateCountRef.current = 1;
          }
          lastTerminateTimeRef.current = now;

          if (terminateCountRef.current <= 2) {
            console.warn('WebView content process terminated, recovering...');
            webViewRef.current?.reload();
          } else {
            console.warn('WebView content process terminated repeatedly.');
          }
        }}
        renderError={(errorDomain, errorCode, errorDesc) => (
          <BrowserErrorView
            errorDomain={errorDomain}
            errorCode={errorCode}
            errorDescription={errorDesc}
            failingUrl={currentUrl || sourceUri}
            onRetry={() => webViewRef.current?.reload()}
            onGoBack={() => {
              if (canGoBack) {
                webViewRef.current?.goBack();
              } else {
                setSourceUri(DEFAULT_HOME);
                setCurrentUrl(DEFAULT_HOME);
              }
            }}
            onGoHome={() => {
              setSourceUri(DEFAULT_HOME);
              setCurrentUrl(DEFAULT_HOME);
            }}
            onDirectDownload={(dlUrl) => handleDownload(dlUrl)}
          />
        )}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        injectedJavaScriptBeforeContentLoaded={
          settings.adBlockEnabled
            ? `
              (function() {
                try {
                  var host = (window.location && window.location.hostname ? window.location.hostname : '').toLowerCase();
                  var href = (window.location && window.location.href ? window.location.href : '').toLowerCase();
                  if (
                    host.indexOf('cloudflare.com') !== -1 ||
                    href.indexOf('challenge-platform') !== -1 ||
                    href.indexOf('cdn-cgi/challenge') !== -1 ||
                    href.indexOf('__cf_chl_') !== -1
                  ) {
                    return;
                  }
                  ${injectedJS}
                  var style = document.createElement('style');
                  style.id = 'td-ad-blocker-css';
                  style.textContent = \`${injectedCSS.replace(/`/g, '\\`')}\`;
                  var target = document.head || document.documentElement || document.body;
                  if (target) {
                    target.appendChild(style);
                  } else {
                    var obs = new MutationObserver(function() {
                      var t = document.head || document.documentElement || document.body;
                      if (t) {
                        t.appendChild(style);
                        obs.disconnect();
                      }
                    });
                    obs.observe(document, { childList: true, subtree: true });
                  }
                } catch(e) {}
              })();
              true;
            `
            : undefined
        }
        injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        startInLoadingState
        decelerationRate="normal"
        applicationNameForUserAgent="Safari/604.1"
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        )}
      />

      {/* IDM-Style Detected Media Sniffer Float */}
      {detectedMedia.length > 0 && (
        <View style={styles.mediaSnifferBar}>
          <TouchableOpacity
            style={styles.mediaSnifferBtn}
            activeOpacity={0.85}
            onPress={() => {
              const latest = detectedMedia[detectedMedia.length - 1];
              setPendingDownloadUrl(latest.url);
              setShowDownloadModal(true);
            }}
          >
            <View style={styles.mediaSnifferIconWrap}>
              <Text style={styles.mediaSnifferIcon}>⚡</Text>
            </View>
            <View style={styles.mediaSnifferTextWrap}>
              <Text style={styles.mediaSnifferTitle} numberOfLines={1}>
                {detectedMedia[detectedMedia.length - 1].title || 'Video Detected!'}
              </Text>
              <Text style={styles.mediaSnifferSubtitle} numberOfLines={1}>
                ⚡ {detectedMedia.length} high-speed stream{detectedMedia.length > 1 ? 's' : ''} captured · Tap to Download
              </Text>
            </View>
            <View style={styles.mediaSnifferAction}>
              <Text style={styles.mediaSnifferActionText}>Download</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Toolbar */}
      <View style={styles.bottomToolbar}>
        <TouchableOpacity
          style={styles.bottomBtn}
          onPress={() => {
            setSourceUri(DEFAULT_HOME);
            setCurrentUrl(DEFAULT_HOME);
            setUrlBarText(DEFAULT_HOME);
          }}
        >
          <Text style={styles.bottomBtnIcon}>🏠</Text>
          <Text style={styles.bottomBtnText}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomBtn} onPress={handleShare}>
          <Text style={styles.bottomBtnIcon}>↗️</Text>
          <Text style={styles.bottomBtnText}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomBtn, styles.downloadLinkBtn]}
          onPress={() => {
            setPendingDownloadUrl(currentUrl);
            setShowDownloadModal(true);
          }}
        >
          <Text style={styles.downloadLinkBtnIcon}>⬇️</Text>
          <Text style={styles.downloadLinkBtnText}>Download</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bottomBtn} onPress={handleAddBookmark}>
          <Text style={styles.bottomBtnIcon}>{isBookmarked ? '★' : '☆'}</Text>
          <Text style={styles.bottomBtnText}>Bookmark</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomBtn}
          onPress={() => webViewRef.current?.reload()}
        >
          <Text style={styles.bottomBtnIcon}>🔄</Text>
          <Text style={styles.bottomBtnText}>Reload</Text>
        </TouchableOpacity>
      </View>

      {/* Floating In-App Toast */}
      {downloadToast && (
        <Animated.View style={[styles.toastContainer, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={styles.toastText} numberOfLines={1}>{downloadToast}</Text>
        </Animated.View>
      )}

      {/* Download modal */}
      <AddDownloadModal
        visible={showDownloadModal}
        onClose={() => {
          setShowDownloadModal(false);
          setPendingDownloadUrl('');
        }}
        onStartDownload={handleDownload}
        initialUrl={pendingDownloadUrl}
      />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.browserToolbar,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 6,
  },
  navButtons: {
    flexDirection: 'row',
    gap: 2,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    fontSize: 22,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginTop: -2,
  },
  navBtnTextDisabled: {
    color: Colors.textTertiary,
  },
  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.browserUrlBar,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  urlBarFocused: {
    borderColor: Colors.borderFocus,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  urlIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  urlInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    padding: 0,
  },
  stopBtn: {
    padding: 4,
  },
  stopBtnText: {
    fontSize: 14,
    color: Colors.textTertiary,
  },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  menuBtnText: {
    fontSize: 18,
    color: Colors.textPrimary,
  },
  progressBar: {
    height: 2,
    backgroundColor: Colors.border,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },

  adBlockBadge: {
    position: 'absolute',
    top: 100,
    right: 10,
    backgroundColor: 'rgba(0, 230, 118, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.2)',
    zIndex: 10,
  },
  adBlockText: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: '600',
  },
  bookmarksPanel: {
    backgroundColor: Colors.backgroundSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 280,
  },
  bookmarksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bookmarksTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  addBookmarkText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  noBookmarks: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingVertical: 16,
  },
  bookmarkItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  bookmarkTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  bookmarkUrl: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill as any,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomToolbar: {
    flexDirection: 'row',
    backgroundColor: Colors.browserToolbar,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  bottomBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  bottomBtnIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  bottomBtnText: {
    fontSize: 10,
    fontWeight: '500',
    color: Colors.textTertiary,
  },
  downloadLinkBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderRadius: 10,
    marginHorizontal: 4,
  },
  downloadLinkBtnIcon: {
    fontSize: 20,
  },
  downloadLinkBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  mediaSnifferBar: {
    position: 'absolute',
    bottom: 60,
    left: 12,
    right: 12,
    zIndex: 99,
  },
  mediaSnifferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131127',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  mediaSnifferIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 242, 254, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  mediaSnifferIcon: {
    fontSize: 20,
  },
  mediaSnifferTextWrap: {
    flex: 1,
  },
  mediaSnifferTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  mediaSnifferSubtitle: {
    color: Colors.accent,
    fontSize: 11,
    marginTop: 2,
  },
  mediaSnifferAction: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  mediaSnifferActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  toastContainer: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 9999,
    maxWidth: '90%',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

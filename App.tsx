import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DownloadProvider } from './src/context/DownloadContext';
import { AppNavigator } from './src/navigation/AppNavigator';

// Splash screen component
function SplashScreen({ onReady }: { onReady: () => void }) {
  const fadeAnim = new Animated.Value(0);
  const scaleAnim = new Animated.Value(0.5);
  const textFadeAnim = new Animated.Value(0);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(textFadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(onReady, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={splashStyles.container}>
      <StatusBar barStyle="light-content" />
      <Animated.View
        style={[
          splashStyles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require('./src/assets/logo.png')}
          style={splashStyles.logoImage}
          resizeMode="cover"
        />
        <View style={splashStyles.glowRing} />
      </Animated.View>
      
      <Animated.View style={[splashStyles.textContainer, { opacity: textFadeAnim }]}>
        <Text style={splashStyles.appName}>Turbo</Text>
        <Text style={splashStyles.appTagline}>Download Manager</Text>
      </Animated.View>

      <Animated.View style={[splashStyles.footer, { opacity: textFadeAnim }]}>
        <Text style={splashStyles.footerText}>High Speed · Ad Free · Background Downloads</Text>
      </Animated.View>
    </View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#00F2FE',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  glowRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 242, 254, 0.4)',
  },
  textContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  appName: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  appTagline: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 60,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    fontWeight: '500',
  },
});

import { ErrorBoundary } from './src/components/ErrorBoundary';

// Global uncaught exception safeguard to prevent iOS app from terminating
if (typeof (globalThis as any).ErrorUtils !== 'undefined') {
  const originalHandler = (globalThis as any).ErrorUtils.getGlobalHandler();
  (globalThis as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.warn('[Global Crash Guard] Intercepted runtime exception (prevented exit):', error?.message || error);
    // Keep app alive for non-system crashes
    if (!isFatal && originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

// Main App
function App(): React.JSX.Element {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <SplashScreen onReady={() => setShowSplash(false)} />;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <DownloadProvider>
          <AppNavigator />
        </DownloadProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default App;

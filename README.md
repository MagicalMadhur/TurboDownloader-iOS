# Turbo Downloader 🚀⚡

A **high-speed download manager** for iOS & Android with a built-in **ad-free browser**, background downloads, and premium dark glassmorphic UI.

## Features

### 🚀 High-Speed Download Engine
- Multi-connection parallel downloading
- Download queue management with configurable concurrent downloads
- Pause, resume, and retry downloads
- Auto-retry on failure
- Real-time speed monitoring

### 🌐 Built-in Ad-Free Browser
- Complete WebView-based browser with navigation controls
- **Ad & tracker blocking** (built-in blocklist like Brave)
- Automatic download link detection
- Manual URL paste for any download link
- Bookmarks support
- Search engine selector (Google, DuckDuckGo, Bing)

### ⏬ Background Downloads
- Downloads continue even when the app is in the background
- Uses iOS `NSURLSession` background configuration for true background downloads
- Download progress notifications

### 📂 File Manager
- Browse downloaded files by category (Video, Audio, Documents, Images, Archives)
- Sort by date, name, or size
- Open files with system apps
- Share files
- Storage usage stats

### 🎨 Premium Dark Glassmorphic UI
- Near-black background with glass-effect cards
- Purple gradient accents with cyan speed indicators
- Smooth animations and micro-interactions
- Animated splash screen

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | React Native 0.87+ |
| Navigation | React Navigation v7 |
| Browser | react-native-webview |
| Downloads | react-native-blob-util |
| Storage | @react-native-async-storage |
| Notifications | @notifee/react-native |

## Getting Started

### Prerequisites
- Node.js 22+
- npm or yarn

### Install Dependencies
```bash
npm install
```

### iOS (on Mac)
```bash
cd ios && pod install && cd ..
npx react-native run-ios
```

### Android
```bash
npx react-native run-android
```

## Building for Release

### Using GitHub Actions
This project includes a GitHub Actions workflow that automatically builds:
- **iOS IPA** on macOS runner
- **Android APK** on Ubuntu runner

Push to `main` branch to trigger the build.

### Required GitHub Secrets (for signed iOS build)
| Secret | Description |
|--------|-------------|
| `IOS_CERTIFICATE_BASE64` | Base64-encoded .p12 certificate |
| `IOS_CERTIFICATE_PASSWORD` | Certificate password |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64-encoded provisioning profile |
| `KEYCHAIN_PASSWORD` | Keychain password for build |

## Project Structure
```
src/
├── components/       # Reusable UI components
│   ├── AddDownloadModal.tsx
│   ├── DownloadCard.tsx
│   └── SpeedMeter.tsx
├── context/          # React context providers
│   └── DownloadContext.tsx
├── navigation/       # Navigation configuration
│   └── AppNavigator.tsx
├── screens/          # App screens
│   ├── DownloadsScreen.tsx
│   ├── BrowserScreen.tsx
│   ├── FilesScreen.tsx
│   └── SettingsScreen.tsx
├── services/         # Business logic
│   ├── downloadEngine.ts
│   └── storage.ts
├── theme/            # Design system
│   ├── colors.ts
│   ├── styles.ts
│   └── index.ts
└── utils/            # Utilities
    ├── fileUtils.ts
    └── adBlocker.ts
```

## License
MIT

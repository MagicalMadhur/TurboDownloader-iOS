// Turbo Downloader - Dark Glassmorphic Theme
export const Colors = {
  // Core backgrounds
  background: '#0A0A0F',
  backgroundSecondary: '#12121A',
  surface: 'rgba(255, 255, 255, 0.05)',
  surfaceHover: 'rgba(255, 255, 255, 0.08)',
  surfaceActive: 'rgba(255, 255, 255, 0.12)',
  
  // Glass effect
  glass: 'rgba(255, 255, 255, 0.06)',
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassHighlight: 'rgba(255, 255, 255, 0.15)',
  
  // Primary gradient colors
  primaryStart: '#6C5CE7',
  primaryEnd: '#A855F7',
  primary: '#8B5CF6',
  
  // Accent
  accent: '#00D2FF',
  accentDark: '#0099CC',
  
  // Speed indicator gradient
  speedGradientStart: '#00D2FF',
  speedGradientEnd: '#6C5CE7',
  
  // Status colors
  success: '#00E676',
  successDark: '#00C853',
  warning: '#FFD600',
  warningDark: '#FFC400',
  error: '#FF5252',
  errorDark: '#FF1744',
  info: '#448AFF',
  
  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  textTertiary: 'rgba(255, 255, 255, 0.35)',
  textInverse: '#0A0A0F',
  
  // Borders
  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.05)',
  borderFocus: 'rgba(139, 92, 246, 0.5)',
  
  // Tab bar
  tabBarBackground: 'rgba(10, 10, 15, 0.95)',
  tabBarBorder: 'rgba(255, 255, 255, 0.08)',
  tabActive: '#8B5CF6',
  tabInactive: 'rgba(255, 255, 255, 0.35)',
  
  // Downloads
  downloadProgressBg: 'rgba(139, 92, 246, 0.15)',
  downloadProgressFill: '#8B5CF6',
  
  // Browser
  browserToolbar: 'rgba(18, 18, 26, 0.98)',
  browserUrlBar: 'rgba(255, 255, 255, 0.08)',
  
  // File type colors
  fileVideo: '#FF6B6B',
  fileAudio: '#4ECDC4',
  fileDocument: '#45B7D1',
  fileImage: '#96CEB4',
  fileArchive: '#FECA57',
  fileOther: '#A29BFE',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',
};

export const Gradients = {
  primary: [Colors.primaryStart, Colors.primaryEnd],
  accent: [Colors.accent, Colors.primaryStart],
  speed: [Colors.speedGradientStart, Colors.speedGradientEnd],
  dark: [Colors.background, Colors.backgroundSecondary],
  surface: ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.03)'],
  downloadCard: ['rgba(139, 92, 246, 0.12)', 'rgba(139, 92, 246, 0.04)'],
};

export const Shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  large: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  glow: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
};

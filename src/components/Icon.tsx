// Icon component using SF Symbols / System text for iOS
// This avoids the need for vector icon fonts which can be tricky to set up

import React from 'react';
import { Text, StyleSheet, TextStyle } from 'react-native';
import { Colors } from '../theme';

interface Props {
  name: string;
  size?: number;
  color?: string;
  style?: TextStyle;
}

// Emoji-based icons that work everywhere without dependencies
const ICON_MAP: Record<string, string> = {
  // Navigation
  'download': '⬇️',
  'downloads': '📥',
  'browser': '🌐',
  'files': '📂',
  'settings': '⚙️',
  'home': '🏠',
  
  // Actions
  'play': '▶️',
  'pause': '⏸',
  'stop': '⏹',
  'refresh': '🔄',
  'delete': '🗑',
  'share': '↗️',
  'add': '➕',
  'close': '✕',
  'search': '🔍',
  'bookmark': '🔖',
  'bookmark-filled': '★',
  'bookmark-empty': '☆',
  'copy': '📋',
  'paste': '📋',
  
  // Status
  'success': '✅',
  'error': '❌',
  'warning': '⚠️',
  'info': 'ℹ️',
  'loading': '⏳',
  
  // File types
  'video': '🎬',
  'audio': '🎵',
  'document': '📄',
  'image': '🖼️',
  'archive': '📦',
  'file': '📁',
  
  // Misc
  'speed': '⚡',
  'rocket': '🚀',
  'shield': '🛡',
  'lock': '🔒',
  'globe': '🌐',
  'wifi': '📶',
  'bell': '🔔',
  'moon': '🌙',
  'storage': '💾',
  'clean': '🧹',
  'back': '‹',
  'forward': '›',
  'menu': '☰',
  'chevron-right': '›',
};

export function Icon({ name, size = 20, color, style }: Props) {
  const emoji = ICON_MAP[name] || name;
  
  return (
    <Text
      style={[
        styles.icon,
        { fontSize: size },
        color ? { color } : null,
        style,
      ]}
    >
      {emoji}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: {
    textAlign: 'center',
  },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { Colors, Shadows } from '../theme';
import { isValidUrl, getFileName } from '../utils/fileUtils';

interface Props {
  visible: boolean;
  onClose: () => void;
  onStartDownload: (url: string, fileName?: string) => void;
  initialUrl?: string;
}

export function AddDownloadModal({ visible, onClose, onStartDownload, initialUrl }: Props) {
  const [url, setUrl] = useState(initialUrl || '');
  const [fileName, setFileName] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      Alert.alert('Error', 'Please enter a download URL');
      return;
    }

    if (!isValidUrl(trimmedUrl)) {
      Alert.alert('Invalid URL', 'Please enter a valid HTTP or HTTPS URL');
      return;
    }

    const finalFileName = fileName.trim() || undefined;
    onStartDownload(trimmedUrl, finalFileName);
    setUrl('');
    setFileName('');
    onClose();
  };

  const handlePaste = async () => {
    try {
      // Use the Clipboard API if available
      const Clipboard = require('react-native').Clipboard;
      if (Clipboard) {
        const text = await Clipboard.getString();
        if (text) {
          setUrl(text);
          if (isValidUrl(text)) {
            setFileName(getFileName(text));
          }
        }
      }
    } catch {
      // Clipboard not available, user can type manually
    }
  };

  const handleUrlChange = (text: string) => {
    setUrl(text);
    if (isValidUrl(text) && !fileName) {
      setFileName(getFileName(text));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLine} />
            <Text style={styles.title}>📥 New Download</Text>
            <Text style={styles.subtitle}>
              Paste or enter the download URL below
            </Text>
          </View>

          {/* URL Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DOWNLOAD URL</Text>
            <View style={styles.urlInputRow}>
              <TextInput
                style={styles.urlInput}
                value={url}
                onChangeText={handleUrlChange}
                placeholder="https://example.com/file.zip"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="next"
                selectionColor={Colors.primary}
              />
              <TouchableOpacity style={styles.pasteBtn} onPress={handlePaste}>
                <Text style={styles.pasteBtnText}>📋</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Filename Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>FILE NAME (OPTIONAL)</Text>
            <TextInput
              style={styles.fileNameInput}
              value={fileName}
              onChangeText={setFileName}
              placeholder="Auto-detected from URL"
              placeholderTextColor={Colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              selectionColor={Colors.primary}
              onSubmitEditing={handleSubmit}
            />
          </View>

          {/* URL Preview */}
          {url && isValidUrl(url) && (
            <View style={styles.preview}>
              <Text style={styles.previewIcon}>✅</Text>
              <Text style={styles.previewText} numberOfLines={1}>
                Valid URL detected
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.downloadButton, !url && styles.downloadButtonDisabled]}
              onPress={handleSubmit}
              disabled={!url}
            >
              <Text style={styles.downloadButtonText}>⚡ Download</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill as any,
    backgroundColor: Colors.overlay,
  },
  modalContainer: {
    backgroundColor: Colors.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.large,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLine: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.glassBorder,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textTertiary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  urlInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  urlInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pasteBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteBtnText: {
    fontSize: 20,
  },
  fileNameInput: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 230, 118, 0.08)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.15)',
  },
  previewIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  previewText: {
    fontSize: 13,
    color: Colors.success,
    fontWeight: '500',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  downloadButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    ...Shadows.glow,
  },
  downloadButtonDisabled: {
    backgroundColor: Colors.surface,
    shadowOpacity: 0,
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
});

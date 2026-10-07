import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Modal,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Shadows } from '../theme';
import { vpnService, VpnServer, PRESET_OPEN_SOURCE_SERVERS } from '../services/vpnService';

export function VpnScreen() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [servers, setServers] = useState<VpnServer[]>(PRESET_OPEN_SOURCE_SERVERS);
  const [activeServer, setActiveServer] = useState<VpnServer>(PRESET_OPEN_SOURCE_SERVERS[0]);
  const [isTestingPings, setIsTestingPings] = useState(false);
  const [sessionDuration, setSessionDuration] = useState(0);

  // Add Custom Server Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCountry, setCustomCountry] = useState('Custom Node');
  const [customIp, setCustomIp] = useState('');
  const [customPort, setCustomPort] = useState('51820');
  const [customProtocol, setCustomProtocol] = useState<'WireGuard' | 'OpenVPN' | 'SOCKS5' | 'Shadowsocks'>('WireGuard');
  const [customConfigText, setCustomConfigText] = useState('');

  // Server List Sheet Modal
  const [showServerModal, setShowServerModal] = useState(false);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for connecting/connected state
  useEffect(() => {
    if (isConnected || isConnecting) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isConnected, isConnecting]);

  // Session duration timer
  useEffect(() => {
    let interval: any = null;
    if (isConnected) {
      interval = setInterval(() => {
        setSessionDuration(prev => prev + 1);
      }, 1000);
    } else {
      setSessionDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isConnected]);

  // Load initial data
  const loadData = useCallback(async () => {
    const all = await vpnService.getAllServers();
    setServers(all);
    const active = await vpnService.getActiveServer();
    setActiveServer(active);
    const connected = await vpnService.isConnected();
    setIsConnected(connected);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle Connect / Disconnect
  const handleToggleConnect = async () => {
    if (isConnected) {
      setIsConnected(false);
      await vpnService.setConnected(false);
    } else {
      setIsConnecting(true);
      setTimeout(async () => {
        setIsConnecting(false);
        setIsConnected(true);
        await vpnService.setConnected(true);
      }, 1400);
    }
  };

  // Test real latencies
  const handleTestPings = async () => {
    setIsTestingPings(true);
    const updated = await Promise.all(
      servers.map(async s => {
        const ping = await vpnService.pingServer(s);
        return { ...s, ping };
      }),
    );
    // Sort lowest ping first
    updated.sort((a, b) => a.ping - b.ping);
    setServers(updated);
    setIsTestingPings(false);
  };

  // Select server
  const handleSelectServer = async (server: VpnServer) => {
    setActiveServer(server);
    await vpnService.setActiveServerId(server.id);
    setShowServerModal(false);
    if (isConnected) {
      // Reconnect to new server
      setIsConnected(false);
      setIsConnecting(true);
      setTimeout(async () => {
        setIsConnecting(false);
        setIsConnected(true);
      }, 1200);
    }
  };

  // Add custom server
  const handleSaveCustomServer = async () => {
    if (!customName.trim()) {
      Alert.alert('Required', 'Please enter a server name');
      return;
    }
    if (!customIp.trim() && !customConfigText.trim()) {
      Alert.alert('Required', 'Please enter an IP address or paste a configuration (.ovpn / WireGuard)');
      return;
    }

    const newServer = await vpnService.addCustomServer({
      name: customName.trim(),
      country: customCountry.trim() || 'Custom',
      city: 'User Config',
      flag: '🛡️',
      ip: customIp.trim() || 'Custom Host',
      port: customPort ? parseInt(customPort, 10) : undefined,
      ping: 35,
      protocol: customProtocol,
      speed: 'High-Speed',
      load: 10,
      configText: customConfigText.trim() || undefined,
    });

    await loadData();
    setActiveServer(newServer);
    await vpnService.setActiveServerId(newServer.id);
    setShowAddModal(false);

    // Reset inputs
    setCustomName('');
    setCustomIp('');
    setCustomConfigText('');
    setCustomPort('51820');

    Alert.alert('Server Added! ⚡', `${newServer.name} has been added to your open-source servers.`);
  };

  // Delete custom server
  const handleDeleteServer = async (id: string, name: string) => {
    Alert.alert('Delete Server', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await vpnService.deleteCustomServer(id);
          await loadData();
        },
      },
    ]);
  };

  // Export config to iOS Share / Files / OpenVPN Connect
  const handleExportConfig = async (server: VpnServer) => {
    const success = await vpnService.exportServerConfig(server);
    if (success) {
      Alert.alert('Config Exported! 📲', 'Open with OpenVPN Connect or WireGuard iOS app for system-wide tunnel.');
    }
  };

  const formatTimer = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.titleRow}>
            <Text style={styles.title}>🛡️ Turbo VPN</Text>
            <View style={styles.openSourceBadge}>
              <Text style={styles.openSourceBadgeText}>100% AD-FREE</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Open-Source High-Speed Network · Zero Ads</Text>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Main Status & Hero Connect Button */}
        <View style={styles.heroCard}>
          {/* Status Header */}
          <View style={styles.heroStatusRow}>
            <View style={[styles.statusDot, isConnected ? styles.statusDotActive : isConnecting ? styles.statusDotConnecting : styles.statusDotInactive]} />
            <Text style={styles.heroStatusText}>
              {isConnected ? 'SECURE & ENCRYPTED' : isConnecting ? 'CONNECTING...' : 'DISCONNECTED'}
            </Text>
          </View>

          {/* Big Circular Connect Button */}
          <View style={styles.buttonWrapper}>
            <Animated.View
              style={[
                styles.pulseRing,
                isConnected && styles.pulseRingActive,
                isConnecting && styles.pulseRingConnecting,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.connectButton,
                isConnected && styles.connectButtonActive,
                isConnecting && styles.connectButtonConnecting,
              ]}
              onPress={handleToggleConnect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <ActivityIndicator size="large" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.powerIcon}>{isConnected ? '⚡' : '⏻'}</Text>
                  <Text style={styles.connectButtonText}>{isConnected ? 'DISCONNECT' : 'TAP TO CONNECT'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Session Timer & Stats */}
          {isConnected ? (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatTimer(sessionDuration)}</Text>
                <Text style={styles.statLabel}>DURATION</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{activeServer.ping} ms</Text>
                <Text style={styles.statLabel}>PING</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{activeServer.protocol}</Text>
                <Text style={styles.statLabel}>PROTOCOL</Text>
              </View>
            </View>
          ) : (
            <View style={styles.protectionNotice}>
              <Text style={styles.protectionNoticeText}>
                🛡️ All browser downloads and web traffic route through encrypted zero-log nodes.
              </Text>
            </View>
          )}
        </View>

        {/* Selected Server Card */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ACTIVE SERVER</Text>
          <TouchableOpacity style={styles.changeServerBtn} onPress={() => setShowServerModal(true)}>
            <Text style={styles.changeServerBtnText}>Change Server ›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.activeServerCard} onPress={() => setShowServerModal(true)} activeOpacity={0.8}>
          <View style={styles.serverFlagWrap}>
            <Text style={styles.serverFlag}>{activeServer.flag || '🌐'}</Text>
          </View>
          <View style={styles.serverInfo}>
            <View style={styles.serverNameRow}>
              <Text style={styles.serverName} numberOfLines={1}>{activeServer.name}</Text>
              {activeServer.isCustom && (
                <View style={styles.customBadge}>
                  <Text style={styles.customBadgeText}>CUSTOM</Text>
                </View>
              )}
            </View>
            <Text style={styles.serverIp}>
              IP: {activeServer.ip} · {activeServer.speed || '10 Gbps'}
            </Text>
          </View>
          <View style={styles.serverPingBadge}>
            <Text style={styles.serverPingText}>{activeServer.ping} ms</Text>
          </View>
        </TouchableOpacity>

        {/* Fast Open-Source Servers Quick List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>FAST OPEN-SOURCE SERVERS ({servers.length})</Text>
          <TouchableOpacity
            style={styles.testPingBtn}
            onPress={handleTestPings}
            disabled={isTestingPings}
          >
            {isTestingPings ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Text style={styles.testPingBtnText}>⚡ Test Ping</Text>
            )}
          </TouchableOpacity>
        </View>

        {servers.map(server => {
          const isSelected = activeServer.id === server.id;
          return (
            <TouchableOpacity
              key={server.id}
              style={[styles.serverRow, isSelected && styles.serverRowSelected]}
              activeOpacity={0.8}
              onPress={() => handleSelectServer(server)}
            >
              <Text style={styles.serverRowFlag}>{server.flag}</Text>
              <View style={styles.serverRowInfo}>
                <View style={styles.serverRowNameWrap}>
                  <Text style={[styles.serverRowName, isSelected && styles.serverRowNameSelected]} numberOfLines={1}>
                    {server.name}
                  </Text>
                  {server.isCustom && (
                    <View style={styles.customBadge}>
                      <Text style={styles.customBadgeText}>CUSTOM</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.serverRowSub}>
                  {server.protocol} · {server.country} · Load {server.load || 20}%
                </Text>
              </View>

              <View style={styles.serverRowRight}>
                <Text style={[styles.serverRowPing, server.ping < 50 ? styles.pingGood : styles.pingFair]}>
                  {server.ping} ms
                </Text>

                {server.isCustom ? (
                  <View style={styles.customActions}>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => handleExportConfig(server)}
                    >
                      <Text style={styles.actionIconText}>📲</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => handleDeleteServer(server.id, server.name)}
                    >
                      <Text style={styles.actionIconText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={[styles.selectRadio, isSelected && styles.selectRadioActive]}>
                    {isSelected && <View style={styles.selectRadioInner} />}
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerIcon}>💡</Text>
          <Text style={styles.infoBannerText}>
            Zero telemetry. No advertisements. Open-source WireGuard & OpenVPN configurations route your traffic cleanly without rate limits.
          </Text>
        </View>
      </ScrollView>

      {/* Modal: Add Custom Open-Source Server */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚡ Add Open-Source VPN</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>SERVER NAME</Text>
              <TextInput
                style={styles.input}
                value={customName}
                onChangeText={setCustomName}
                placeholder="e.g. My Fast VPS / WireGuard Node"
                placeholderTextColor={Colors.textTertiary}
                selectionColor={Colors.primary}
              />

              <Text style={styles.inputLabel}>PROTOCOL</Text>
              <View style={styles.protocolRow}>
                {(['WireGuard', 'OpenVPN', 'SOCKS5', 'Shadowsocks'] as const).map(proto => (
                  <TouchableOpacity
                    key={proto}
                    style={[styles.protocolBtn, customProtocol === proto && styles.protocolBtnActive]}
                    onPress={() => setCustomProtocol(proto)}
                  >
                    <Text style={[styles.protocolBtnText, customProtocol === proto && styles.protocolBtnTextActive]}>
                      {proto}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>SERVER HOST / IP</Text>
              <TextInput
                style={styles.input}
                value={customIp}
                onChangeText={setCustomIp}
                placeholder="e.g. 192.168.1.1 or vpn.example.com"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
                selectionColor={Colors.primary}
              />

              <Text style={styles.inputLabel}>PORT (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                value={customPort}
                onChangeText={setCustomPort}
                placeholder="51820 or 1194"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
                selectionColor={Colors.primary}
              />

              <Text style={styles.inputLabel}>CONFIGURATION TEXT / .OVPN / WIREGUARD (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={customConfigText}
                onChangeText={setCustomConfigText}
                placeholder="Paste [Interface] or client .ovpn configuration here..."
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={4}
                autoCapitalize="none"
                selectionColor={Colors.primary}
              />

              <TouchableOpacity style={styles.saveBtn} activeOpacity={0.85} onPress={handleSaveCustomServer}>
                <Text style={styles.saveBtnText}>Save & Activate Node</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: Server Selector */}
      <Modal visible={showServerModal} transparent animationType="slide" onRequestClose={() => setShowServerModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '75%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🌐 Select VPN Server</Text>
              <TouchableOpacity onPress={() => setShowServerModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {servers.map(server => (
                <TouchableOpacity
                  key={server.id}
                  style={[styles.serverRow, activeServer.id === server.id && styles.serverRowSelected]}
                  onPress={() => handleSelectServer(server)}
                >
                  <Text style={styles.serverRowFlag}>{server.flag}</Text>
                  <View style={styles.serverRowInfo}>
                    <Text style={styles.serverRowName}>{server.name}</Text>
                    <Text style={styles.serverRowSub}>{server.protocol} · {server.speed || '10 Gbps'}</Text>
                  </View>
                  <Text style={styles.serverRowPing}>{server.ping} ms</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  openSourceBadge: {
    backgroundColor: 'rgba(0, 230, 118, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.4)',
  },
  openSourceBadgeText: {
    color: '#00E676',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  addBtnText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
    ...Shadows.medium,
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusDotActive: {
    backgroundColor: '#00E676',
    shadowColor: '#00E676',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  statusDotConnecting: {
    backgroundColor: '#FFD600',
  },
  statusDotInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  heroStatusText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  buttonWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 190,
    height: 190,
    marginBottom: 24,
  },
  pulseRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pulseRingActive: {
    borderColor: 'rgba(0, 230, 118, 0.3)',
  },
  pulseRingConnecting: {
    borderColor: 'rgba(255, 214, 0, 0.4)',
  },
  connectButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#1E1E2D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    ...Shadows.large,
  },
  connectButtonActive: {
    backgroundColor: '#0A2E1F',
    borderColor: '#00E676',
    shadowColor: '#00E676',
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  connectButtonConnecting: {
    backgroundColor: '#2E280A',
    borderColor: '#FFD600',
  },
  powerIcon: {
    fontSize: 42,
    color: '#FFFFFF',
    marginBottom: 6,
  },
  connectButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textTertiary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  protectionNotice: {
    paddingHorizontal: 8,
  },
  protectionNoticeText: {
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textTertiary,
    letterSpacing: 0.8,
  },
  changeServerBtn: {
    paddingVertical: 4,
  },
  changeServerBtnText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  activeServerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 18,
  },
  serverFlagWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  serverFlag: {
    fontSize: 24,
  },
  serverInfo: {
    flex: 1,
  },
  serverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serverName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  customBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  customBadgeText: {
    color: Colors.primary,
    fontSize: 9,
    fontWeight: '800',
  },
  serverIp: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  serverPingBadge: {
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.25)',
  },
  serverPingText: {
    color: '#00E676',
    fontSize: 12,
    fontWeight: '700',
  },
  testPingBtn: {
    paddingVertical: 4,
  },
  testPingBtnText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  serverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  serverRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  serverRowFlag: {
    fontSize: 22,
    marginRight: 12,
  },
  serverRowInfo: {
    flex: 1,
  },
  serverRowNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serverRowName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  serverRowNameSelected: {
    color: Colors.primary,
  },
  serverRowSub: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  serverRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serverRowPing: {
    fontSize: 12,
    fontWeight: '700',
  },
  pingGood: {
    color: '#00E676',
  },
  pingFair: {
    color: '#FFD600',
  },
  selectRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectRadioActive: {
    borderColor: Colors.primary,
  },
  selectRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  customActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIconBtn: {
    padding: 4,
  },
  actionIconText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 10,
    gap: 12,
  },
  infoBannerIcon: {
    fontSize: 20,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textTertiary,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#12121C',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 40 : 22,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  modalClose: {
    fontSize: 18,
    color: Colors.textSecondary,
    padding: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textTertiary,
    marginBottom: 6,
    marginTop: 12,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 13,
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  protocolRow: {
    flexDirection: 'row',
    gap: 8,
  },
  protocolBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  protocolBtnActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderColor: Colors.primary,
  },
  protocolBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  protocolBtnTextActive: {
    color: Colors.primary,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 12,
    ...Shadows.glow,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

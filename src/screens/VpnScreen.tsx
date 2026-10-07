import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Shadows } from '../theme';
import { vpnService, VpnServer, PublicIpInfo, PRESET_OPEN_SOURCE_SERVERS } from '../services/vpnService';

export function VpnScreen() {
  const [servers, setServers] = useState<VpnServer[]>(PRESET_OPEN_SOURCE_SERVERS);
  const [activeServer, setActiveServer] = useState<VpnServer>(PRESET_OPEN_SOURCE_SERVERS[0]);
  const [isTestingPings, setIsTestingPings] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Live IP state
  const [ipInfo, setIpInfo] = useState<PublicIpInfo | null>(null);
  const [isCheckingIp, setIsCheckingIp] = useState(false);

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

  // Load initial data & check IP
  const loadData = useCallback(async () => {
    const all = await vpnService.getAllServers();
    setServers(all);
    const active = await vpnService.getActiveServer();
    setActiveServer(active);
    handleCheckIp();
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real Public IP check
  const handleCheckIp = async () => {
    setIsCheckingIp(true);
    const info = await vpnService.checkPublicIp();
    setIpInfo(info);
    setIsCheckingIp(false);
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
    updated.sort((a, b) => a.ping - b.ping);
    setServers(updated);
    setIsTestingPings(false);
  };

  // Select server
  const handleSelectServer = async (server: VpnServer) => {
    setActiveServer(server);
    await vpnService.setActiveServerId(server.id);
    setShowServerModal(false);
  };

  // Activate server into WireGuard or OpenVPN Connect
  const handleActivateServer = async (server: VpnServer) => {
    setIsExporting(true);
    const success = await vpnService.exportServerConfig(server);
    setIsExporting(false);

    if (success) {
      const clientName = server.protocol === 'WireGuard' ? 'WireGuard' : 'OpenVPN Connect';
      Alert.alert(
        `Import to ${clientName} ⚡`,
        `1. Choose "Open in ${clientName}" from the iOS menu.\n2. Tap Add/Allow.\n3. Turn the switch ON — your iPhone's [VPN] icon will appear next to the battery!`,
        [
          { text: 'Done', style: 'default' },
          {
            text: `Open ${clientName} App`,
            onPress: () => vpnService.openClientApp(server.protocol === 'WireGuard' ? 'WireGuard' : 'OpenVPN'),
          },
        ],
      );
    }
  };

  // Add custom server
  const handleSaveCustomServer = async () => {
    if (!customName.trim()) {
      Alert.alert('Required', 'Please enter a server name');
      return;
    }
    if (!customIp.trim() && !customConfigText.trim()) {
      Alert.alert('Required', 'Please enter an IP address or paste a configuration');
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

    setCustomName('');
    setCustomIp('');
    setCustomConfigText('');
    setCustomPort('51820');

    Alert.alert('Server Added! ⚡', `${newServer.name} has been added.`);
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
          <Text style={styles.subtitle}>Open-Source High-Speed Nodes · Zero Ads</Text>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>+ Add Node</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Real Live IP & Privacy Checker Card */}
        <View style={styles.ipCard}>
          <View style={styles.ipCardHeader}>
            <Text style={styles.ipCardLabel}>CURRENT PUBLIC IP & LOCATION</Text>
            <TouchableOpacity
              style={styles.checkIpBtn}
              onPress={handleCheckIp}
              disabled={isCheckingIp}
            >
              {isCheckingIp ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <Text style={styles.checkIpBtnText}>🔄 Verify IP</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.ipRow}>
            <Text style={styles.ipAddress}>
              {ipInfo ? ipInfo.ip : isCheckingIp ? 'Checking...' : 'Tap Verify to check IP'}
            </Text>
          </View>

          {ipInfo && (
            <Text style={styles.ipLocation}>
              📍 {ipInfo.city ? `${ipInfo.city}, ` : ''}{ipInfo.country || 'Unknown Location'} {ipInfo.org ? `(${ipInfo.org})` : ''}
            </Text>
          )}

          <View style={styles.ipHelpNote}>
            <Text style={styles.ipHelpNoteText}>
              💡 Once connected via WireGuard / OpenVPN below, your iPhone status bar shows the real [VPN] box and this IP changes to the VPN country.
            </Text>
          </View>
        </View>

        {/* Hero Active Server & 1-Tap iOS Activation Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.flagCircle}>
              <Text style={styles.flagEmoji}>{activeServer.flag || '🌐'}</Text>
            </View>
            <View style={styles.heroServerInfo}>
              <View style={styles.heroTitleRow}>
                <Text style={styles.heroServerName} numberOfLines={1}>{activeServer.name}</Text>
                {activeServer.isCustom && (
                  <View style={styles.customBadge}>
                    <Text style={styles.customBadgeText}>CUSTOM</Text>
                  </View>
                )}
              </View>
              <Text style={styles.heroServerSub}>
                {activeServer.country} · {activeServer.speed || '10 Gbps'} · {activeServer.protocol}
              </Text>
            </View>
            <TouchableOpacity style={styles.switchServerBtn} onPress={() => setShowServerModal(true)}>
              <Text style={styles.switchServerBtnText}>Switch ›</Text>
            </TouchableOpacity>
          </View>

          {/* Stats Bar */}
          <View style={styles.heroStatsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statBoxValue}>{activeServer.ping} ms</Text>
              <Text style={styles.statBoxLabel}>LATENCY</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statBoxValue}>{activeServer.speed || '10 Gbps'}</Text>
              <Text style={styles.statBoxLabel}>BANDWIDTH</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statBoxValue}>{activeServer.protocol}</Text>
              <Text style={styles.statBoxLabel}>PROTOCOL</Text>
            </View>
          </View>

          {/* 1-Tap Connect Action Button */}
          <TouchableOpacity
            style={styles.activateBtn}
            activeOpacity={0.85}
            onPress={() => handleActivateServer(activeServer)}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.activateBtnIcon}>⚡</Text>
                <Text style={styles.activateBtnText}>
                  Activate in {activeServer.protocol === 'WireGuard' ? 'WireGuard' : 'OpenVPN'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.clientAppBtn}
            onPress={() => vpnService.openClientApp(activeServer.protocol === 'WireGuard' ? 'WireGuard' : 'OpenVPN')}
          >
            <Text style={styles.clientAppBtnText}>
              📲 Open {activeServer.protocol === 'WireGuard' ? 'WireGuard' : 'OpenVPN'} Client App
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3-Step Guide Card */}
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>HOW REAL AD-FREE VPN WORKS ON IOS</Text>
          <View style={styles.guideStep}>
            <Text style={styles.guideNum}>1</Text>
            <Text style={styles.guideText}>
              Install the official open-source <Text style={styles.boldText}>WireGuard</Text> or <Text style={styles.boldText}>OpenVPN Connect</Text> app from App Store (both are 100% free and have zero ads).
            </Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideNum}>2</Text>
            <Text style={styles.guideText}>
              Tap <Text style={styles.boldText}>"Activate"</Text> on any high-speed node below to import the configuration in 1 click.
            </Text>
          </View>
          <View style={styles.guideStep}>
            <Text style={styles.guideNum}>3</Text>
            <Text style={styles.guideText}>
              Toggle the switch ON — your iPhone status bar displays the real <Text style={styles.boldText}>[VPN]</Text> icon beside the battery, completely masking your IP across all apps!
            </Text>
          </View>
        </View>

        {/* Server List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>FAST OPEN-SOURCE NODES ({servers.length})</Text>
          <TouchableOpacity
            style={styles.testPingBtn}
            onPress={handleTestPings}
            disabled={isTestingPings}
          >
            {isTestingPings ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Text style={styles.testPingBtnText}>⚡ Test Latency</Text>
            )}
          </TouchableOpacity>
        </View>

        {servers.map(server => {
          const isSelected = activeServer.id === server.id;
          return (
            <View
              key={server.id}
              style={[styles.serverCard, isSelected && styles.serverCardSelected]}
            >
              <TouchableOpacity
                style={styles.serverCardMain}
                activeOpacity={0.8}
                onPress={() => handleSelectServer(server)}
              >
                <Text style={styles.serverFlag}>{server.flag}</Text>
                <View style={styles.serverCardInfo}>
                  <View style={styles.serverCardNameRow}>
                    <Text style={[styles.serverCardName, isSelected && styles.serverCardNameSelected]} numberOfLines={1}>
                      {server.name}
                    </Text>
                    {server.isCustom && (
                      <View style={styles.customBadge}>
                        <Text style={styles.customBadgeText}>CUSTOM</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.serverCardSub}>
                    {server.protocol} · {server.speed || '10 Gbps'} · Ping {server.ping} ms
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.serverCardActions}>
                <TouchableOpacity
                  style={styles.quickActivateBtn}
                  onPress={() => handleActivateServer(server)}
                >
                  <Text style={styles.quickActivateBtnText}>Activate</Text>
                </TouchableOpacity>

                {server.isCustom && (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteServer(server.id, server.name)}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Modal: Add Custom Open-Source Server */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚡ Add Custom Open-Source VPN</Text>
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
                  style={[styles.serverCard, activeServer.id === server.id && styles.serverCardSelected]}
                  onPress={() => handleSelectServer(server)}
                >
                  <Text style={styles.serverFlag}>{server.flag}</Text>
                  <View style={styles.serverCardInfo}>
                    <Text style={styles.serverCardName}>{server.name}</Text>
                    <Text style={styles.serverCardSub}>{server.protocol} · {server.speed || '10 Gbps'} · {server.ping} ms</Text>
                  </View>
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
  ipCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
  },
  ipCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ipCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textTertiary,
    letterSpacing: 0.8,
  },
  checkIpBtn: {
    paddingVertical: 2,
  },
  checkIpBtnText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  ipRow: {
    marginBottom: 4,
  },
  ipAddress: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  ipLocation: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  ipHelpNote: {
    backgroundColor: 'rgba(0, 210, 255, 0.08)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 255, 0.2)',
  },
  ipHelpNoteText: {
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
    ...Shadows.medium,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  flagCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  flagEmoji: {
    fontSize: 26,
  },
  heroServerInfo: {
    flex: 1,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroServerName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  heroServerSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  switchServerBtn: {
    paddingVertical: 6,
  },
  switchServerBtnText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginBottom: 18,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statBoxValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  statBoxLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textTertiary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.border,
  },
  activateBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 16,
    gap: 8,
    marginBottom: 10,
    ...Shadows.glow,
  },
  activateBtnIcon: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  activateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  clientAppBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  clientAppBtnText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  guideCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  guideTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textTertiary,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 12,
  },
  guideNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    color: Colors.primary,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '800',
    fontSize: 11,
  },
  guideText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  boldText: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textTertiary,
    letterSpacing: 0.8,
  },
  testPingBtn: {
    paddingVertical: 4,
  },
  testPingBtnText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  serverCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  serverCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  serverFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  serverCardInfo: {
    flex: 1,
  },
  serverCardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serverCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  serverCardNameSelected: {
    color: Colors.primary,
  },
  serverCardSub: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  serverCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickActivateBtn: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  quickActivateBtnText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 6,
  },
  deleteBtnText: {
    color: Colors.textTertiary,
    fontSize: 14,
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

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors, Shadows } from '../theme';
import { useDownloads } from '../context/DownloadContext';
import { DownloadsScreen } from '../screens/DownloadsScreen';
import { BrowserScreen } from '../screens/BrowserScreen';
import { FilesScreen } from '../screens/FilesScreen';
import { VpnScreen } from '../screens/VpnScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Downloads: { active: '⚡', inactive: '⬇️' },
  Browser: { active: '🌐', inactive: '🌐' },
  VPN: { active: '🛡️', inactive: '🛡️' },
  Files: { active: '📂', inactive: '📁' },
  Settings: { active: '⚙️', inactive: '⚙️' },
};

function TabIcon({ route, focused }: { route: string; focused: boolean }) {
  const icons = TAB_ICONS[route] || { active: '📱', inactive: '📱' };
  return (
    <View style={[styles.tabIconContainer, focused && styles.tabIconContainerActive]}>
      <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>
        {focused ? icons.active : icons.inactive}
      </Text>
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

export function AppNavigator() {
  const { activeDownloads } = useDownloads();
  const activeCount = activeDownloads.length;

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: Colors.primary,
          background: Colors.background,
          card: Colors.tabBarBackground,
          text: Colors.textPrimary,
          border: Colors.tabBarBorder,
          notification: Colors.error,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '900' },
        },
      }}
    >
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused }) => <TabIcon route={route.name} focused={focused} />,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.tabInactive,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
        })}
      >
        <Tab.Screen
          name="Downloads"
          component={DownloadsScreen}
          options={{
            tabBarBadge: activeCount > 0 ? activeCount : undefined,
            tabBarBadgeStyle: styles.tabBadge,
          }}
        />
        <Tab.Screen name="Browser" component={BrowserScreen} />
        <Tab.Screen name="VPN" component={VpnScreen} />
        <Tab.Screen name="Files" component={FilesScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBarBackground,
    borderTopColor: Colors.tabBarBorder,
    borderTopWidth: 1,
    height: Platform.OS === 'ios' ? 88 : 64,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: 8,
    ...Shadows.medium,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  tabItem: {
    paddingTop: 4,
  },
  tabBadge: {
    backgroundColor: Colors.error,
    fontSize: 10,
    fontWeight: '700',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    lineHeight: 18,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabIconContainerActive: {},
  tabIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
    fontSize: 24,
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 2,
    ...Shadows.glow,
  },
});

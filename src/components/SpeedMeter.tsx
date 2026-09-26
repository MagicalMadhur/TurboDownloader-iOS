import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Colors, Shadows } from '../theme';
import { formatSpeed } from '../utils/fileUtils';

interface Props {
  speed: number;
  activeCount: number;
}

export function SpeedMeter({ speed, activeCount }: Props) {
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (speed > 0) {
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowAnim, {
              toValue: 1,
              duration: 1500,
              useNativeDriver: true,
            }),
            Animated.timing(glowAnim, {
              toValue: 0.3,
              duration: 1500,
              useNativeDriver: true,
            }),
          ]),
        ),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [speed > 0]);

  const getSpeedLevel = (): { label: string; color: string } => {
    if (speed === 0) return { label: 'IDLE', color: Colors.textTertiary };
    if (speed < 500 * 1024) return { label: 'NORMAL', color: Colors.warning };
    if (speed < 2 * 1024 * 1024) return { label: 'FAST', color: Colors.accent };
    return { label: 'TURBO', color: Colors.success };
  };

  const { label, color } = getSpeedLevel();

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      {/* Glow effect when downloading */}
      {speed > 0 && (
        <Animated.View
          style={[
            styles.glowEffect,
            {
              opacity: glowAnim,
              borderColor: color,
              shadowColor: color,
            },
          ]}
        />
      )}

      <View style={styles.innerContent}>
        <View style={styles.speedRow}>
          <Text style={styles.rocketIcon}>{speed > 0 ? '🚀' : '💤'}</Text>
          <View>
            <Text style={[styles.speedValue, { color }]}>
              {formatSpeed(speed)}
            </Text>
            <View style={styles.labelRow}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={[styles.speedLabel, { color }]}>{label}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{activeCount}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {speed > 0 ? '⚡' : '—'}
            </Text>
            <Text style={styles.statLabel}>Status</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
    position: 'relative',
    ...Shadows.medium,
  },
  glowEffect: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  innerContent: {
    padding: 18,
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rocketIcon: {
    fontSize: 36,
    marginRight: 14,
  },
  speedValue: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Menlo',
    letterSpacing: -0.5,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  speedLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
});

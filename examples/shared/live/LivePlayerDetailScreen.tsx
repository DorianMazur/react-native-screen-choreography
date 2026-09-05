import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  ChoreographyScreen,
  SafeAreaView,
  SharedElement,
  useChoreographyProgress,
  useExampleNavigation,
} from '../runtime';
import { InteractiveBackGesture } from '../InteractiveBackGesture';
import { theme } from '../theme';
import { LIVE_PLAYER_GROUP, LIVE_PLAYER_SPRING } from './LivePlayerSurface';

export function LivePlayerDetailScreen() {
  const { goBack } = useExampleNavigation('LivePlayerDetail');
  const { progress } = useChoreographyProgress();
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 0.85], [0, 1], 'clamp'),
    transform: [
      {
        translateY: interpolate(progress.value, [0.55, 0.85], [-8, 0], 'clamp'),
      },
    ],
  }));
  const queueStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.72, 1], [0, 1], 'clamp'),
    transform: [
      {
        translateY: interpolate(progress.value, [0.72, 1], [18, 0], 'clamp'),
      },
    ],
  }));

  return (
    <ChoreographyScreen screenId="LivePlayerDetail">
      <InteractiveBackGesture>
        <View style={styles.root}>
          <SafeAreaView style={styles.safe}>
            <Animated.View style={[styles.header, headerStyle]}>
              <Text style={styles.eyebrow}>Now playing</Text>
              <Pressable
                onPress={() => goBack({ spring: LIVE_PLAYER_SPRING })}
                hitSlop={12}
              >
                <Text style={styles.close}>Close</Text>
              </Pressable>
            </Animated.View>

            <SharedElement.LiveTarget
              id="player"
              groupId={LIVE_PLAYER_GROUP}
              style={styles.playerTarget}
            />

            <Animated.View style={[styles.queue, queueStyle]}>
              <Text style={styles.queueLabel}>Up next</Text>
              <Text style={styles.queueTitle}>Glass Signals</Text>
              <Text style={styles.queueMeta}>Mara Ell · 4:08</Text>
            </Animated.View>
          </SafeAreaView>
        </View>
      </InteractiveBackGesture>
    </ChoreographyScreen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B100E',
  },
  safe: {
    flex: 1,
  },
  header: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
  },
  eyebrow: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  close: {
    color: '#D8E6A3',
    fontSize: 15,
    fontWeight: '700',
  },
  playerTarget: {
    height: 430,
    marginHorizontal: 16,
    marginTop: 12,
  },
  queue: {
    marginHorizontal: 24,
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.borderStrong,
  },
  queueLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  queueTitle: {
    color: theme.text,
    fontSize: 17,
    fontWeight: '700',
    marginTop: 8,
  },
  queueMeta: {
    color: theme.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
});

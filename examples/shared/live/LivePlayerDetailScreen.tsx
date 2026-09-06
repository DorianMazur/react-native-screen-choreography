import React from 'react';
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScreenHeader } from '../AppChrome';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  SafeAreaView,
  SharedElement,
  useChoreographyProgress,
  useExampleNavigation,
} from '../runtime';
import { InteractiveBackGesture } from '../InteractiveBackGesture';
import { theme } from '../theme';
import { LIVE_PLAYER_GROUP, LIVE_PLAYER_SPRING } from './LivePlayerSurface';

export function LivePlayerDetailScreen() {
  const { goBack } = useExampleNavigation();
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
    <>
      <InteractiveBackGesture>
        <View style={styles.root}>
          <SafeAreaView style={styles.safe}>
            <StatusBar barStyle="light-content" />
            <Animated.View style={headerStyle}>
              <ScreenHeader
                title="Now playing"
                backLabel="Close player"
                onBack={() => goBack({ spring: LIVE_PLAYER_SPRING })}
              />
            </Animated.View>
            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
            >
              <SharedElement.LiveTarget
                id="player"
                groupId={LIVE_PLAYER_GROUP}
                style={styles.playerTarget}
              />

              <Animated.View style={[styles.queue, queueStyle]}>
                <Text style={styles.queueLabel}>Up next</Text>
                <View style={styles.queueRow}>
                  <Image
                    source={require('../assets/photos/coast.jpg')}
                    style={styles.queueArt}
                  />
                  <View style={styles.queueCopy}>
                    <Text style={styles.queueTitle}>Glass Signals</Text>
                    <Text style={styles.queueMeta}>Mara Ell</Text>
                  </View>
                  <Text style={styles.duration}>4:08</Text>
                </View>
              </Animated.View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </InteractiveBackGesture>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  safe: {
    flex: 1,
  },
  scroll: { paddingBottom: 32 },
  playerTarget: {
    height: 460,
    marginHorizontal: 24,
    marginTop: 12,
  },
  queue: {
    marginHorizontal: 24,
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  queueLabel: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 21,
    fontWeight: '600',
  },
  queueTitle: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 17,
    fontWeight: '600',
  },
  queueMeta: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  queueRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  queueArt: { width: 48, height: 48, borderRadius: 8 },
  queueCopy: { flex: 1 },
  duration: {
    fontFamily: theme.numbers,
    fontSize: 11,
    color: theme.textSecondary,
  },
});

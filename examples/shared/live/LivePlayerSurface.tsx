import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useChoreographyProgress } from '../runtime';
import { theme } from '../theme';

export const LIVE_PLAYER_GROUP = 'live-player.demo';
export const LIVE_PLAYER_SPRING = {
  damping: 28,
  mass: 1,
  stiffness: 180,
  overshootClamping: true,
};
const TRACK_LENGTH = 214;

const COMPACT = {
  padding: 12,
  artwork: 72,
  artworkTop: 23,
  copyLeft: 98,
  copyRight: 12,
  copyTop: 16,
  radius: theme.radius.lg,
  titleSize: 18,
  titleLineHeight: 22,
  buttonHeight: 28,
};
const EXPANDED = {
  padding: 24,
  artworkTop: 24,
  artworkHeight: 230,
  copyTop: 278,
  radius: theme.radius.xl,
  titleSize: 30,
  titleLineHeight: 36,
  buttonHeight: 40,
};

export function LivePlayerSurface() {
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(38);
  const { width: windowWidth } = useWindowDimensions();
  const { progress } = useChoreographyProgress();
  const spin = useSharedValue(0);

  useEffect(() => {
    if (!playing) {
      cancelAnimation(spin);
      return;
    }
    spin.value = withRepeat(
      withTiming(spin.value + 1, { duration: 6000, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(spin);
  }, [playing, spin]);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const interval = setInterval(() => {
      setElapsed((value) => (value + 1) % TRACK_LENGTH);
    }, 1000);
    return () => clearInterval(interval);
  }, [playing]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = String(elapsed % 60).padStart(2, '0');
  const playback = elapsed / TRACK_LENGTH;
  const expandedArtworkWidth = windowWidth - 32 - EXPANDED.padding * 2;

  const surfaceStyle = useAnimatedStyle(() => ({
    borderRadius: interpolate(
      progress.value,
      [0, 1],
      [COMPACT.radius, EXPANDED.radius],
      'clamp'
    ),
  }));

  const handleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 1], [0, 1], 'clamp'),
  }));

  // Artwork eases in (t²) so it stays clear of the copy during the handoff.
  const artworkStyle = useAnimatedStyle(() => {
    const t = progress.value * progress.value;
    return {
      left: interpolate(t, [0, 1], [COMPACT.padding, EXPANDED.padding]),
      top: interpolate(t, [0, 1], [COMPACT.artworkTop, EXPANDED.artworkTop]),
      width: interpolate(t, [0, 1], [COMPACT.artwork, expandedArtworkWidth]),
      height: interpolate(t, [0, 1], [COMPACT.artwork, EXPANDED.artworkHeight]),
      borderRadius: interpolate(t, [0, 1], [10, theme.radius.lg]),
    };
  });

  const recordStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const copyStyle = useAnimatedStyle(() => {
    const t = progress.value + 0.5 * progress.value * (1 - progress.value);
    // Horizontal travel starts once the copy has dropped below the artwork.
    return {
      left: interpolate(
        progress.value,
        [0.2, 0.5],
        [COMPACT.copyLeft, EXPANDED.padding],
        'clamp'
      ),
      right: interpolate(
        progress.value,
        [0.2, 0.5],
        [COMPACT.copyRight, EXPANDED.padding],
        'clamp'
      ),
      top: interpolate(t, [0, 1], [COMPACT.copyTop, EXPANDED.copyTop]),
    };
  });

  const titleStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(
      progress.value,
      [0, 1],
      [COMPACT.titleSize, EXPANDED.titleSize]
    ),
    lineHeight: interpolate(
      progress.value,
      [0, 1],
      [COMPACT.titleLineHeight, EXPANDED.titleLineHeight]
    ),
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    height: interpolate(
      progress.value,
      [0, 1],
      [COMPACT.buttonHeight, EXPANDED.buttonHeight]
    ),
    minWidth: interpolate(progress.value, [0, 1], [58, 88]),
  }));

  const timelineStyle = useAnimatedStyle(() => ({
    marginTop: interpolate(progress.value, [0, 1], [7, 22]),
  }));

  return (
    <Animated.View style={[styles.surface, surfaceStyle]}>
      <Animated.View style={[styles.handle, handleStyle]} />

      <Animated.View style={[styles.artwork, artworkStyle]}>
        <Animated.View style={[styles.record, recordStyle]}>
          <View style={styles.recordRing} />
          <View style={styles.recordLabel} />
        </Animated.View>
      </Animated.View>

      <Animated.View style={[styles.copy, copyStyle]}>
        <Text style={styles.eyebrow}>Live session</Text>
        <Animated.Text style={[styles.title, titleStyle]}>
          Continuum
        </Animated.Text>
        <Text style={styles.artist}>Nia Vale</Text>

        <Animated.View style={[styles.timeline, timelineStyle]}>
          <View style={[styles.timelineFill, { flex: playback }]} />
          <View style={{ flex: 1 - playback }} />
        </Animated.View>

        <View style={styles.controlRow}>
          <Text style={styles.time}>
            {minutes}:{seconds}
          </Text>
          <Pressable
            accessibilityLabel={playing ? 'Pause track' : 'Play track'}
            accessibilityRole="button"
            onPress={() => setPlaying((value) => !value)}
          >
            <Animated.View style={[styles.playButton, buttonStyle]}>
              <Text style={styles.playLabel}>{playing ? 'Pause' : 'Play'}</Text>
            </Animated.View>
          </Pressable>
          <Text style={[styles.time, styles.timeEnd]}>3:34</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    backgroundColor: '#17201C',
    overflow: 'hidden',
  },
  artwork: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#D8E6A3',
  },
  handle: {
    position: 'absolute',
    top: 9,
    left: '50%',
    zIndex: 1,
    width: 38,
    height: 5,
    marginLeft: -19,
    borderRadius: 3,
    backgroundColor: 'rgba(216,230,163,0.55)',
  },
  record: {
    width: '72%',
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#17201C',
  },
  recordRing: {
    position: 'absolute',
    width: '70%',
    height: '70%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(216,230,163,0.28)',
  },
  recordLabel: {
    width: '26%',
    height: '26%',
    borderRadius: 999,
    backgroundColor: '#E46D4D',
  },
  copy: {
    position: 'absolute',
    minWidth: 0,
  },
  eyebrow: {
    color: '#9BC7AE',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: theme.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    marginTop: 4,
  },
  artist: {
    color: theme.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  timeline: {
    height: 3,
    flexDirection: 'row',
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  timelineFill: {
    backgroundColor: '#D8E6A3',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  time: {
    width: 38,
    color: theme.textMuted,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  timeEnd: {
    textAlign: 'right',
  },
  playButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: '#D8E6A3',
  },
  playLabel: {
    color: '#17201C',
    fontSize: 12,
    fontWeight: '800',
  },
});

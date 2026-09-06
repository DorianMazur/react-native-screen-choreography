import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  StatusBar,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
  useSharedValue,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';
import {
  SafeAreaView,
  SharedElement,
  useChoreographyProgress,
  useExampleNavigation,
} from '../runtime';
import { theme } from '../theme';
import { TRACKS } from './data';
import {
  musicBackgroundTransition,
  musicContentTransition,
  musicHeaderTransition,
  musicItemTransition,
} from './musicTransitions';
import { TrackItem } from './TrackItem';
import { IconButton, ScreenHeader } from '../AppChrome';

const WAVE_BARS = 32;
const waveHeights = Array.from({ length: WAVE_BARS }, (_, index) =>
  Math.max(
    0.18,
    Math.min(
      1,
      0.55 +
        Math.sin(index * 0.6) * 0.4 +
        Math.cos(index * 0.31) * 0.3 +
        Math.sin(index * 1.13) * 0.18
    )
  )
);
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function NowPlayingScreen({
  trackId = TRACKS[0]!.id,
}: {
  trackId?: string;
}) {
  const track = TRACKS.find((item) => item.id === trackId) ?? TRACKS[0]!;
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [minutes = 0, seconds = 0] = track.duration.split(':').map(Number);
  const duration = minutes * 60 + seconds;
  const { goBack } = useExampleNavigation();
  const { settleTransition } = useChoreographyProgress();
  const groupId = `track.${track.id}`;

  const playhead = useSharedValue(0);
  useEffect(() => {
    if (!playing) {
      cancelAnimation(playhead);
      return;
    }
    playhead.value = withRepeat(
      withTiming(1, {
        duration: 4500,
        easing: Easing.inOut(Easing.cubic),
      }),
      -1,
      true
    );
    return () => cancelAnimation(playhead);
  }, [playhead, playing]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(
      () => setElapsed((value) => Math.min(duration, value + 1)),
      1000
    );
    return () => clearInterval(interval);
  }, [duration, playing]);

  useEffect(() => {
    if (elapsed === duration) setPlaying(false);
  }, [elapsed, duration]);

  return (
    <>
      <View style={styles.root} onTouchStart={settleTransition}>
        <StatusBar barStyle="light-content" />
        <SharedElement
          id="background"
          groupId={groupId}
          transition={musicBackgroundTransition}
          style={styles.screenBackground}
        >
          <View style={styles.fill} />
        </SharedElement>

        <SafeAreaView style={styles.foreground} pointerEvents="box-none">
          <SharedElement
            id="header"
            groupId={groupId}
            transition={musicHeaderTransition}
          >
            <ScreenHeader
              title="Now playing"
              onBack={() => goBack()}
              backLabel="Back to music"
            />
          </SharedElement>
          <View style={styles.selectedItemSlot}>
            <SharedElement
              id="item"
              groupId={groupId}
              transition={musicItemTransition}
              style={styles.selectedItem}
            >
              <TrackItem track={track} />
            </SharedElement>
          </View>

          <SharedElement
            id="content"
            groupId={groupId}
            transition={musicContentTransition}
            style={styles.revealContent}
          >
            <ScrollView
              contentContainerStyle={styles.revealContentInner}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.content}>
                <View testID="now-playing-artwork" style={styles.cover}>
                  <Image
                    source={track.artwork}
                    resizeMode="cover"
                    style={styles.coverImage}
                    accessibilityLabel={`${track.album} artwork`}
                  />
                </View>
                <Text style={styles.eyebrow}>DEMO SESSION</Text>
                <Text style={styles.album}>{track.album}</Text>
                <Waveform accent={theme.accent} playhead={playhead} />
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>{formatTime(elapsed)}</Text>
                  <Text style={styles.timeText}>{track.duration}</Text>
                </View>
              </View>

              <View style={styles.controls}>
                <IconButton
                  icon="previous"
                  label="Rewind 15 seconds"
                  onPress={() => setElapsed((value) => Math.max(0, value - 15))}
                />
                <IconButton
                  primary
                  icon={playing ? 'pause' : 'play'}
                  label={playing ? 'Pause preview' : 'Play preview'}
                  onPress={() => {
                    if (elapsed === duration) setElapsed(0);
                    setPlaying((value) => !value);
                  }}
                />
                <IconButton
                  icon="next"
                  label="Forward 15 seconds"
                  onPress={() =>
                    setElapsed((value) => Math.min(duration, value + 15))
                  }
                />
              </View>

              <View style={styles.footer}>
                <View style={styles.metaRow}>
                  <MetaPill label="BPM" value={String(track.bpm)} />
                  <MetaPill label="Year" value={String(track.releaseYear)} />
                  <MetaPill label="Quality" value="Lossless" />
                </View>
              </View>
            </ScrollView>
          </SharedElement>
        </SafeAreaView>
      </View>
    </>
  );
}

function Waveform({
  accent,
  playhead,
}: {
  accent: string;
  playhead: { value: number };
}) {
  return (
    <View style={styles.wave}>
      {waveHeights.map((height, index) => (
        <Bar
          key={index}
          index={index}
          totalBars={WAVE_BARS}
          height={height}
          accent={accent}
          playhead={playhead}
        />
      ))}
    </View>
  );
}

function Bar({
  index,
  totalBars,
  height,
  accent,
  playhead,
}: {
  index: number;
  totalBars: number;
  height: number;
  accent: string;
  playhead: { value: number };
}) {
  const waveProgress = useDerivedValue(() => playhead.value);
  const animated = useAnimatedStyle(() => {
    const phase = (index / totalBars) * 2 - 1;
    const wobble = 0.85 + 0.15 * Math.sin(phase * 6 + waveProgress.value * 8);
    const passed = index / totalBars <= waveProgress.value;
    const heightPx = interpolate(wobble, [0.7, 1], [height * 36, height * 56]);
    return {
      height: heightPx,
      backgroundColor: passed ? accent : 'rgba(255,255,255,0.18)',
    };
  });
  return <Animated.View style={[styles.waveBar, animated]} />;
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  screenBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.bg,
    borderRadius: 0,
  },
  fill: {
    flex: 1,
  },
  foreground: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  selectedItemSlot: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  selectedItem: {
    height: 76,
  },
  revealContent: {
    flex: 1,
  },
  revealContentInner: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  cover: {
    width: '100%',
    aspectRatio: 1.6,
    maxHeight: 260,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 8,
    marginBottom: 24,
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  eyebrow: {
    fontFamily: theme.font,
    color: theme.music.accent,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  album: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 26,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 18,
  },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    gap: 4,
  },
  waveBar: {
    flex: 1,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  timeText: {
    fontFamily: theme.numbers,
    color: theme.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingVertical: 24,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footer: {
    marginHorizontal: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  metaPill: {
    flex: 1,
    paddingBottom: 12,
  },
  metaLabel: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontFamily: theme.numbers,
    color: theme.text,
    fontSize: 14,
    marginTop: 4,
  },
});

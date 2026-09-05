import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
  useSharedValue,
  interpolate,
} from 'react-native-reanimated';
import {
  ChoreographyScreen,
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
  musicItemTransition,
} from './musicTransitions';
import { TrackItem } from './TrackItem';

const WAVE_BARS = 32;

export function NowPlayingScreen({
  trackId = TRACKS[0]!.id,
}: {
  trackId?: string;
}) {
  const track = TRACKS.find((t) => t.id === trackId) ?? TRACKS[0]!;
  const { goBack } = useExampleNavigation('NowPlaying');
  const { settleTransition } = useChoreographyProgress();
  const groupId = `track.${track.id}`;

  const playhead = useSharedValue(0);
  React.useEffect(() => {
    playhead.value = 0;
    playhead.value = withRepeat(
      withTiming(1, {
        duration: 4500,
        easing: Easing.inOut(Easing.cubic),
      }),
      -1,
      true
    );
  }, [playhead, track.id]);

  return (
    <ChoreographyScreen screenId="NowPlaying">
      <View style={styles.root} onTouchStart={settleTransition}>
        <SharedElement
          id="background"
          groupId={groupId}
          transition={musicBackgroundTransition}
          style={styles.screenBackground}
        >
          <View style={styles.fill} />
        </SharedElement>

        <SafeAreaView style={styles.foreground} pointerEvents="box-none">
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
            <View style={styles.revealContentInner}>
              <View style={styles.content}>
                <Text style={styles.eyebrow}>Now playing</Text>
                <Text style={styles.album}>{track.album}</Text>
                <Waveform accent={track.accent} playhead={playhead} />
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>1:42</Text>
                  <Text style={styles.timeText}>{track.duration}</Text>
                </View>
              </View>

              <View style={styles.controls}>
                <ControlButton glyph="⤆" />
                <PlayButton accent={track.accent} />
                <ControlButton glyph="⤻" />
              </View>

              <View style={styles.footer}>
                <View style={styles.metaRow}>
                  <MetaPill label="BPM" value={String(track.bpm)} />
                  <MetaPill label="Year" value={String(track.releaseYear)} />
                  <MetaPill label="Quality" value="Lossless" />
                </View>
                <Pressable style={styles.closeButton} onPress={() => goBack()}>
                  <Text style={styles.closeLabel}>Close player</Text>
                </Pressable>
              </View>
            </View>
          </SharedElement>
        </SafeAreaView>
      </View>
    </ChoreographyScreen>
  );
}

function Waveform({
  accent,
  playhead,
}: {
  accent: string;
  playhead: { value: number };
}) {
  const heights = React.useMemo(
    () =>
      Array.from({ length: WAVE_BARS }, (_, i) => {
        const a = Math.sin(i * 0.6) * 0.4;
        const b = Math.cos(i * 0.31) * 0.3;
        const c = Math.sin(i * 1.13) * 0.18;
        return Math.max(0.18, Math.min(1, 0.55 + a + b + c));
      }),
    []
  );
  return (
    <View style={styles.wave}>
      {heights.map((h, i) => (
        <Bar
          key={i}
          index={i}
          totalBars={WAVE_BARS}
          h={h}
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
  h,
  accent,
  playhead,
}: {
  index: number;
  totalBars: number;
  h: number;
  accent: string;
  playhead: { value: number };
}) {
  const t = useDerivedValue(() => playhead.value);
  const animated = useAnimatedStyle(() => {
    const phase = (index / totalBars) * 2 - 1;
    const wobble = 0.85 + 0.15 * Math.sin(phase * 6 + t.value * 8);
    const passed = index / totalBars <= t.value;
    const heightPx = interpolate(wobble, [0.7, 1], [h * 36, h * 56]);
    return {
      height: heightPx,
      backgroundColor: passed ? accent : 'rgba(255,255,255,0.18)',
    };
  });
  return <Animated.View style={[styles.waveBar, animated]} />;
}

function ControlButton({ glyph }: { glyph: string }) {
  return (
    <Pressable style={styles.controlButton}>
      <Text style={styles.controlGlyph}>{glyph}</Text>
    </Pressable>
  );
}

function PlayButton({ accent }: { accent: string }) {
  return (
    <Pressable style={[styles.playButton, { backgroundColor: accent }]}>
      <Text style={styles.playGlyph}>▶</Text>
    </Pressable>
  );
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
    backgroundColor: theme.surface,
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
    flex: 1,
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 44,
  },
  eyebrow: {
    color: theme.music.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  album: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 28,
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
    color: theme.textMuted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingTop: 28,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  controlGlyph: {
    fontSize: 22,
    color: theme.text,
  },
  playButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    fontSize: 26,
    color: '#0A0A0F',
    fontWeight: '700',
    marginLeft: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footer: {
    marginTop: 'auto',
    paddingHorizontal: 28,
    paddingBottom: 8,
    gap: 16,
  },
  metaPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  metaLabel: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  closeButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.borderStrong,
    borderRadius: theme.radius.md,
  },
  closeLabel: {
    color: theme.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
});

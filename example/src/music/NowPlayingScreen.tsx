import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
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
  SharedElement,
  useChoreographyNavigation,
  useChoreographyProgress,
  useLatchedReveal,
  useStaggeredReveal,
} from 'react-native-screen-choreography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientBlock } from '../GradientBlock';
import { theme } from '../theme';
import { TRACKS } from './data';
import {
  musicCardTransition,
  musicArtworkTransition,
  musicTitleTransition,
  musicArtistTransition,
} from './musicTransitions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 64;
const WAVE_BARS = 32;

export function NowPlayingScreen({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const trackId = route.params?.trackId ?? TRACKS[0]!.id;
  const track = TRACKS.find((t) => t.id === trackId) ?? TRACKS[0]!;
  const { goBack } = useChoreographyNavigation(navigation);
  const { settleTransition, progress } = useChoreographyProgress();
  const showControls = useLatchedReveal({ resetKey: track.id });
  const { getItemStyle } = useStaggeredReveal(3, { stagger: 0.05 });
  const waveSectionStyle = getItemStyle(0);
  const controlsStyle = getItemStyle(1);
  const metaRowStyle = getItemStyle(2);

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

  // Backdrop fades from full-card → blurred fullscreen ambient as progress grows.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  return (
    <ChoreographyScreen screenId="NowPlaying">
      <View style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, backdropStyle]}
          pointerEvents="none"
        >
          <GradientBlock
            from={track.gradientFrom}
            to={'#000000'}
            angle={180}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, styles.bgScrim]} />
        </Animated.View>

        <SafeAreaView style={styles.safe} onTouchStart={settleTransition}>
          <View style={styles.header}>
            <Pressable onPress={() => goBack()} hitSlop={12}>
              <Text style={styles.headerAction}>↓ Close</Text>
            </Pressable>
            <Text style={styles.headerCaption}>Now Playing</Text>
            <View style={styles.headerSpacer} />
          </View>

          <View style={styles.artworkSlot}>
            <SharedElement
              id={`track.${track.id}.card`}
              groupId={`track.${track.id}`}
              transition={musicCardTransition}
              style={styles.artworkFrame}
            >
              <SharedElement
                id={`track.${track.id}.artwork`}
                groupId={`track.${track.id}`}
                transition={musicArtworkTransition}
              >
                <GradientBlock
                  from={track.gradientFrom}
                  to={track.gradientTo}
                  style={styles.artworkLarge}
                  borderRadius={theme.radius.xl}
                >
                  <View style={styles.artGlyphWrap}>
                    <Text style={styles.artGlyph}>{track.glyph}</Text>
                  </View>
                </GradientBlock>
              </SharedElement>
            </SharedElement>
          </View>

          <View style={styles.titleBlock}>
            <SharedElement
              id={`track.${track.id}.title`}
              groupId={`track.${track.id}`}
              transition={musicTitleTransition}
            >
              <Text style={styles.title}>{track.title}</Text>
            </SharedElement>
            <SharedElement
              id={`track.${track.id}.artist`}
              groupId={`track.${track.id}`}
              transition={musicArtistTransition}
            >
              <Text style={styles.artist}>
                {track.artist} · {track.album}
              </Text>
            </SharedElement>
          </View>

          {showControls ? (
            <>
              <Animated.View style={[styles.section, waveSectionStyle]}>
                <Waveform accent={track.accent} playhead={playhead} />
                <View style={styles.timeRow}>
                  <Text style={styles.timeText}>1:42</Text>
                  <Text style={styles.timeText}>{track.duration}</Text>
                </View>
              </Animated.View>

              <Animated.View style={[styles.controls, controlsStyle]}>
                <ControlButton glyph="⤆" />
                <PlayButton accent={track.accent} />
                <ControlButton glyph="⤻" />
              </Animated.View>

              <Animated.View style={[styles.metaRow, metaRowStyle]}>
                <MetaPill label="BPM" value={String(track.bpm)} />
                <MetaPill label="Year" value={String(track.releaseYear)} />
                <MetaPill label="Quality" value="Lossless" />
              </Animated.View>
            </>
          ) : null}
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
    backgroundColor: theme.bg,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerAction: {
    color: theme.text,
    fontSize: 15,
    fontWeight: '500',
    width: 60,
  },
  headerCaption: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerSpacer: {
    width: 60,
  },
  bgScrim: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  artworkSlot: {
    alignItems: 'center',
    paddingTop: 8,
  },
  artworkFrame: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  artworkLarge: {
    flex: 1,
  },
  artGlyphWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlyph: {
    fontSize: 100,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '200',
  },
  titleBlock: {
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  title: {
    color: theme.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  artist: {
    color: theme.textSecondary,
    fontSize: 16,
    marginTop: 6,
  },
  section: {
    paddingHorizontal: 28,
    paddingTop: 28,
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
    paddingHorizontal: 28,
    paddingTop: 24,
    gap: 10,
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
});

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  ScrollView,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { IconButton } from '../AppChrome';
import { theme } from '../theme';
import type { Track } from './data';

const WAVE_BARS = 32;
const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function TrackItem({
  track,
  onOpen,
}: {
  track: Track;
  onOpen: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [minutes = 0, seconds = 0] = track.duration.split(':').map(Number);
  const duration = minutes * 60 + seconds;
  const phase = useSharedValue(0);

  useEffect(() => {
    if (!playing) return;
    phase.value = withRepeat(
      withTiming(phase.value + Math.PI * 2, {
        duration: 2400,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    const interval = setInterval(() => {
      setElapsed((value) => Math.min(duration, value + 1));
    }, 1000);
    return () => {
      clearInterval(interval);
      cancelAnimation(phase);
    };
  }, [duration, phase, playing]);

  useEffect(() => {
    if (elapsed === duration) setPlaying(false);
  }, [duration, elapsed]);

  const togglePlayback = () => {
    if (elapsed === duration) setElapsed(0);
    setPlaying((value) => !value);
  };

  return (
    <View
      style={styles.player}
      onLayout={({ nativeEvent }) =>
        setExpanded(nativeEvent.layout.height > 80)
      }
    >
      <View style={styles.item}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${track.title} by ${track.artist}`}
          disabled={expanded}
          onPress={onOpen}
          style={styles.trackButton}
        >
          <Image
            source={track.artwork}
            style={styles.artwork}
            resizeMode="cover"
          />
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
        </Pressable>
        <Text style={[styles.duration, playing && styles.activeTime]}>
          {elapsed > 0 || playing ? formatTime(elapsed) : track.duration}
        </Text>
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={`${playing ? 'Pause' : 'Play'} ${track.title}`}
          onPress={togglePlayback}
        />
        <View
          style={[
            styles.miniProgress,
            { width: `${(elapsed / duration) * 100}%` },
          ]}
        />
      </View>

      <ScrollView
        style={styles.details}
        contentContainerStyle={styles.detailsInner}
        showsVerticalScrollIndicator={false}
        scrollEnabled={expanded}
        accessibilityElementsHidden={!expanded}
        importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      >
        <View testID="now-playing-artwork" style={styles.cover}>
          <Image
            source={track.artwork}
            resizeMode="cover"
            style={styles.coverImage}
            accessibilityLabel={`${track.album} artwork`}
          />
        </View>
        <Text style={styles.eyebrow}>FROM THE ALBUM</Text>
        <Text style={styles.album}>{track.album}</Text>
        <View style={styles.wave}>
          {Array.from({ length: WAVE_BARS }, (_, index) => (
            <Bar
              key={index}
              index={index}
              phase={phase}
              passed={index / WAVE_BARS <= elapsed / duration}
            />
          ))}
        </View>
        <View style={styles.timeRow}>
          <Text testID={`elapsed-${track.id}`} style={styles.timeText}>
            {formatTime(elapsed)}
          </Text>
          <Text style={styles.timeText}>{track.duration}</Text>
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
            onPress={togglePlayback}
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
          <Metadata label="BPM" value={String(track.bpm)} />
          <Metadata label="Year" value={String(track.releaseYear)} />
          <Metadata label="Quality" value="Lossless" />
        </View>
      </ScrollView>
    </View>
  );
}

function Bar({
  index,
  phase,
  passed,
}: {
  index: number;
  phase: { value: number };
  passed: boolean;
}) {
  const height = Math.max(
    0.18,
    Math.min(
      1,
      0.55 + Math.sin(index * 0.6) * 0.4 + Math.cos(index * 0.31) * 0.3
    )
  );
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: height * (0.8 + 0.2 * Math.sin(index + phase.value)) },
    ],
  }));
  return (
    <Animated.View
      style={[styles.waveBar, passed && styles.waveBarPassed, animatedStyle]}
    />
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metadata}>
      <Text style={styles.eyebrow}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  player: {
    flex: 1,
    overflow: 'hidden',
  },
  item: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  trackButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.sm,
  },
  meta: {
    flex: 1,
  },
  title: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  artist: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  duration: {
    fontFamily: theme.numbers,
    color: theme.textSecondary,
    fontSize: 11,
    width: 34,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  activeTime: { color: theme.music.accent },
  miniProgress: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    backgroundColor: theme.music.accent,
  },
  details: { flex: 1 },
  detailsInner: {
    paddingHorizontal: 8,
    paddingTop: 20,
    paddingBottom: 24,
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
  coverImage: { width: '100%', height: '100%' },
  eyebrow: {
    fontFamily: theme.font,
    color: theme.textSecondary,
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
    height: 56,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  waveBarPassed: { backgroundColor: theme.accent },
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
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  metadata: { flex: 1, paddingBottom: 12 },
  metaValue: {
    fontFamily: theme.numbers,
    color: theme.text,
    fontSize: 14,
    marginTop: 4,
  },
});

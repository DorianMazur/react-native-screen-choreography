import { View, Text, StyleSheet, Image } from 'react-native';
import { theme } from '../theme';
import type { Track } from './data';

export function TrackItem({ track }: { track: Track }) {
  return (
    <View style={styles.item}>
      <Image source={track.artwork} style={styles.artwork} resizeMode="cover" />

      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      <Text style={styles.duration}>{track.duration}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    fontVariant: ['tabular-nums'],
  },
});

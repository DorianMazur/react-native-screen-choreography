import { View, Text, StyleSheet } from 'react-native';
import { GradientBlock } from '../GradientBlock';
import { theme } from '../theme';
import type { Track } from './data';

export function TrackItem({ track }: { track: Track }) {
  return (
    <View style={styles.item}>
      <GradientBlock
        from={track.gradientFrom}
        to={track.gradientTo}
        style={styles.artwork}
        borderRadius={theme.radius.sm}
      >
        <View style={styles.artGlyphWrap}>
          <Text style={styles.artGlyph}>{track.glyph}</Text>
        </View>
      </GradientBlock>

      <View style={styles.meta}>
        <Text style={styles.title}>{track.title}</Text>
        <Text style={styles.artist}>{track.artist}</Text>
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
  },
  artGlyphWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlyph: {
    fontSize: 26,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '300',
  },
  meta: {
    flex: 1,
  },
  title: {
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  artist: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  duration: {
    color: theme.textMuted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
});

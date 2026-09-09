import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import type { Track } from './data';

let nextInstanceId = 1;

export function LiveGeometryPanel({ track }: { track: Track }) {
  const [instanceId] = useState(() => nextInstanceId++);
  const [count, setCount] = useState(0);

  return (
    <View style={styles.panel} testID={`live-geometry-${track.id}`}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>LIVE INSTANCE {instanceId}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.state}>STATE {count}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increment live state for ${track.title}`}
        onPress={() => setCount((value) => value + 1)}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonLabel}>+1</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: 160,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#172033',
    borderWidth: 1,
    borderColor: '#3a4f78',
    boxShadow: '0 5px 14px rgba(0, 0, 0, 0.28)',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: '#8eabd7',
    fontFamily: theme.numbers,
    fontSize: 7,
    fontWeight: '700',
  },
  title: {
    color: theme.text,
    fontFamily: theme.font,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  state: {
    color: theme.textSecondary,
    fontFamily: theme.numbers,
    fontSize: 8,
    marginTop: 2,
  },
  button: {
    width: 34,
    height: 34,
    marginLeft: 8,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.music.accent,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  buttonLabel: {
    color: theme.bg,
    fontFamily: theme.numbers,
    fontSize: 12,
    fontWeight: '700',
  },
});

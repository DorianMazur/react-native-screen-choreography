import { Pressable, StyleSheet, Text } from 'react-native';
import { AppIcon } from '../AppChrome';
import { trayTheme } from './TrayChrome';

export function GalleryPlusButton({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      accessibilityLabel={title}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{title}</Text>
      <AppIcon name="arrow" color={trayTheme.onAccent} size={19} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 54,
    borderRadius: 18,
    backgroundColor: trayTheme.accent,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    color: trayTheme.onAccent,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: { opacity: 0.55 },
});

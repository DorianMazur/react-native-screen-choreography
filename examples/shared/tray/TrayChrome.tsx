import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { AppIcon } from '../AppChrome';
import { theme } from '../theme';

export const trayTheme = {
  background: theme.bgElevated,
  surface: theme.surface,
  surfaceRaised: theme.surfaceElevated,
  control: '#ffffff08',
  border: '#ffffff12',
  borderStrong: '#ffffff30',
  text: theme.text,
  muted: theme.textSecondary,
  accent: theme.accent,
  accentSoft: '#c8f79d18',
  onAccent: theme.ink,
  radius: 14,
};

export function DemoTrayHeader({
  eyebrow,
  title,
  color = trayTheme.text,
  onBack,
  onClose,
}: {
  eyebrow: string;
  title: string;
  color?: ColorValue;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back in tray"
          onPress={onBack}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <AppIcon name="back" color={trayTheme.text} size={24} />
        </Pressable>
      )}
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={[styles.title, { color }]}>
          {title}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close tray"
        onPress={onClose}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <AppIcon name="close" color={trayTheme.text} size={22} />
      </Pressable>
    </View>
  );
}

export function DemoTrayButton({
  title,
  onPress,
  disabled = false,
  arrow = false,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  arrow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        style,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
      {arrow && <AppIcon name="arrow" color={trayTheme.onAccent} size={19} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: trayTheme.control,
  },
  heading: { flex: 1, gap: 5 },
  eyebrow: {
    color: trayTheme.muted,
    fontFamily: theme.font,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
  },
  title: {
    fontFamily: theme.font,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  button: {
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: trayTheme.accent,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  buttonText: {
    fontFamily: theme.font,
    color: trayTheme.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: { opacity: 0.55 },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../AppChrome';
import { theme } from '../theme';

export function TrayLauncher({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: 'wallet' | 'camera';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <AppIcon
          name={icon}
          color={icon === 'camera' ? theme.gallery.accent : theme.wallet.accent}
          size={24}
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <AppIcon name="arrow" color={theme.textSecondary} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  launcher: {
    marginHorizontal: 24,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { flex: 1, gap: 4 },
  title: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  pressed: { opacity: 0.6 },
});

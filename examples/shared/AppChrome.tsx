import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

const icons = {
  back: require('./assets/icons/arrow-left.png'),
  external: require('./assets/icons/arrow-up-right.png'),
  arrow: require('./assets/icons/arrow-right.png'),
  eye: require('./assets/icons/eye.png'),
  eyeOff: require('./assets/icons/eye-off.png'),
  close: require('./assets/icons/x.png'),
  expand: require('./assets/icons/maximize-2.png'),
  share: require('./assets/icons/share-2.png'),
  camera: require('./assets/icons/camera.png'),
  wallet: require('./assets/icons/wallet.png'),
  plus: require('./assets/icons/plus.png'),
  restore: require('./assets/icons/rotate-ccw.png'),
  download: require('./assets/icons/download.png'),
  cloud: require('./assets/icons/cloud.png'),
  help: require('./assets/icons/circle-help.png'),
  user: require('./assets/icons/user-round.png'),
};

export function AppIcon({
  name,
  color = theme.text,
  size = 22,
}: {
  name: keyof typeof icons;
  color?: string;
  size?: number;
}) {
  return (
    <Image
      accessible={false}
      source={icons[name]}
      style={{ width: size, height: size, tintColor: color }}
    />
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  primary = false,
}: {
  icon: keyof typeof icons;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`control-${icon}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        pressed && styles.pressed,
      ]}
    >
      <AppIcon
        name={icon}
        color={primary ? theme.ink : theme.text}
        size={primary ? 26 : 22}
      />
    </Pressable>
  );
}

export function ScreenHeader({
  title,
  onBack,
  backLabel = 'Back to examples',
  right,
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <IconButton icon="back" label={backLabel} onPress={onBack} />
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.accent,
  },
  pressed: { opacity: 0.55 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  title: {
    flex: 1,
    fontFamily: theme.font,
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginLeft: 4,
  },
});

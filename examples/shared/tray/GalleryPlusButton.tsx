import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSharedElementPresentation } from 'react-native-screen-choreography/core';
import { AppIcon } from '../AppChrome';
import { trayTheme } from './TrayChrome';

export interface GalleryPlusButtonAction {
  title: string;
  onPress: () => void;
}

/** One live button moves between endpoints; only its labels crossfade. */
export function GalleryPlusButton({ title, onPress }: GalleryPlusButtonAction) {
  const { presentationProgress, transitioning, settled, collapsed, expanded } =
    useSharedElementPresentation();
  const collapsedAction = (collapsed.metadata as
    | GalleryPlusButtonAction
    | undefined) ?? { title, onPress };
  const expandedAction = (expanded.metadata as
    | GalleryPlusButtonAction
    | undefined) ?? { title, onPress };
  const action = settled === 'expanded' ? expandedAction : collapsedAction;
  const sourceLabel = useAnimatedStyle(() => ({
    opacity: 1 - Math.max(0, Math.min(1, presentationProgress.value)),
  }));
  const targetLabel = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, presentationProgress.value)),
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action.title}
      accessibilityState={{ disabled: transitioning }}
      disabled={transitioning}
      onPress={action.onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <View
        style={styles.labels}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.Text style={[styles.label, sourceLabel]}>
          {collapsedAction.title}
        </Animated.Text>
        <Animated.Text style={[styles.label, targetLabel]}>
          {expandedAction.title}
        </Animated.Text>
      </View>
      <AppIcon name="arrow" color={trayTheme.onAccent} size={19} />
    </Pressable>
  );
}

export const galleryPlusButtonStyle = { width: '100%', height: 54 } as const;

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    backgroundColor: trayTheme.accent,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  labels: { width: 124, height: 22 },
  label: {
    ...StyleSheet.absoluteFill,
    color: trayTheme.onAccent,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: { opacity: 0.55 },
});

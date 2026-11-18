import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  defineTransition,
  makeTransition,
  type TransitionRendererProps,
} from 'react-native-screen-choreography/core';
import { daylightFrame, daylightOpacities } from './daylightGeometry';

function DaylightRenderer({
  source,
  target,
  progress,
  direction,
  zIndex,
  children,
}: TransitionRendererProps) {
  const backward = direction === 'backward';
  const collapsed = (backward ? target : source).metrics;
  const expanded = (backward ? source : target).metrics;
  const animatedStyle = useAnimatedStyle(() => {
    const frame = daylightFrame(collapsed, expanded, progress.value);
    return {
      opacity: daylightOpacities(progress.value).icon,
      transform: [
        { translateX: frame.x + frame.width / 2 - collapsed.width / 2 },
        { translateY: frame.y + frame.height / 2 - collapsed.height / 2 },
        { scale: frame.width / collapsed.width },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.icon,
        { width: collapsed.width, height: collapsed.height, zIndex },
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export const daylightTransition = defineTransition({
  motion: {
    spring: { damping: 36, stiffness: 380, mass: 1, overshootClamping: true },
  },
  shared: { photo: makeTransition({ renderer: DaylightRenderer }) },
});

const styles = StyleSheet.create({
  icon: { position: 'absolute', left: 0, top: 0 },
});

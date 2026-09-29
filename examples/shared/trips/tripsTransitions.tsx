import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  makeTransition,
  type TransitionRendererProps,
} from 'react-native-screen-choreography/core';
import { defineTransition } from '../runtime';
import { theme } from '../theme';
import { tripHorizontalProgress } from './tripGeometry';
import { tripPickupPosition, type TripPickupMetadata } from './tripPickup';

function TripExpansion({
  source,
  target,
  direction,
  progress,
  zIndex,
  children,
}: TransitionRendererProps) {
  const collapsed = direction === 'forward' ? source.metrics : target.metrics;
  const expanded = direction === 'forward' ? target.metrics : source.metrics;
  const pickupMetadata = (
    direction === 'forward' ? target.metadata : source.metadata
  ) as TripPickupMetadata | undefined;
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, progress.value));
    const horizontal = tripHorizontalProgress(t);
    const frame = {
      left: collapsed.pageX + (expanded.pageX - collapsed.pageX) * horizontal,
      top: collapsed.pageY + (expanded.pageY - collapsed.pageY) * t,
      width: collapsed.width + (expanded.width - collapsed.width) * horizontal,
      height: collapsed.height + (expanded.height - collapsed.height) * t,
      borderRadius: theme.radius.lg * (1 - horizontal),
    };
    const point = pickupMetadata?.pickup.value;
    const landing = pickupMetadata?.landing.value ?? 1;
    if (!point?.active) return frame;
    return {
      ...frame,
      ...tripPickupPosition(frame, point, landing),
      transformOrigin: [
        point.anchorX * frame.width,
        point.anchorY * frame.height,
        0,
      ],
      transform: [{ rotate: `${point.tilt * (1 - t) * (1 - landing)}deg` }],
    };
  });
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: pickupMetadata?.pickup.value.active
      ? (1 - Math.max(0, Math.min(1, progress.value))) *
        (1 - pickupMetadata.landing.value)
      : 0,
  }));
  const clipStyle = useAnimatedStyle(() => ({
    borderRadius:
      theme.radius.lg *
      (1 - tripHorizontalProgress(Math.max(0, Math.min(1, progress.value)))),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.position, { zIndex }, style]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.shadow, shadowStyle]}
      />
      <Animated.View style={[StyleSheet.absoluteFill, styles.frame, clipStyle]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

export const tripsTransition = defineTransition({
  motion: { spring: { duration: 800, dampingRatio: 1 } },
  shared: { trip: makeTransition({ renderer: TripExpansion }) },
  exit: { chrome: { during: [0, 0.25], translateY: -12 } },
});

const styles = StyleSheet.create({
  position: { position: 'absolute' },
  frame: { overflow: 'hidden', borderRadius: theme.radius.lg },
  shadow: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.surface,
    boxShadow: '0px 16px 36px rgba(0, 0, 0, 0.45)',
  },
});

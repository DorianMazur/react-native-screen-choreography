import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type { SharedElementTransition } from 'react-native-screen-choreography/core';

export const setupOptionTransition: SharedElementTransition = {
  zIndex: 2,
  renderer: function SetupOptionTransition({
    progress,
    direction,
    source,
    target,
    zIndex,
  }) {
    const compact = direction === 'forward' ? source : target;
    const expanded = direction === 'forward' ? target : source;
    const from = compact.metrics;
    const to = expanded.metrics;
    const frame = useAnimatedStyle(() => ({
      left: interpolate(
        progress.value,
        [0, 1],
        [from.pageX, to.pageX],
        'clamp'
      ),
      top: interpolate(progress.value, [0, 1], [from.pageY, to.pageY], 'clamp'),
      width: interpolate(
        progress.value,
        [0, 1],
        [from.width, to.width],
        'clamp'
      ),
      height: interpolate(
        progress.value,
        [0, 1],
        [from.height, to.height],
        'clamp'
      ),
    }));
    const compactStyle = useAnimatedStyle(() => ({
      opacity:
        1 -
        Easing.inOut(Easing.cubic)(
          interpolate(progress.value, [0.2, 0.78], [0, 1], 'clamp')
        ),
    }));
    const expandedStyle = useAnimatedStyle(() => ({
      opacity: Easing.inOut(Easing.cubic)(
        interpolate(progress.value, [0.2, 0.78], [0, 1], 'clamp')
      ),
    }));

    return (
      <Animated.View
        pointerEvents="none"
        style={[styles.frame, { zIndex }, frame]}
      >
        <Animated.View
          style={[StyleSheet.absoluteFill, compact.style, compactStyle]}
        >
          {compact.content}
        </Animated.View>
        <Animated.View
          style={[StyleSheet.absoluteFill, expanded.style, expandedStyle]}
        >
          {expanded.content}
        </Animated.View>
      </Animated.View>
    );
  },
};

const styles = StyleSheet.create({
  frame: { position: 'absolute', overflow: 'hidden', borderRadius: 8 },
});

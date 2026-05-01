// Minimal mock for react-native-reanimated in tests
module.exports = {
  useSharedValue: (initial) => ({ value: initial }),
  useAnimatedStyle: (fn) => fn(),
  makeMutable: (initial) => ({ value: initial }),
  withSpring: (toValue) => toValue,
  withTiming: (toValue) => toValue,
  interpolate: (value, inputRange, outputRange, extrapolation) => {
    if (inputRange.length < 2 || outputRange.length < 2)
      return outputRange[0] || 0;

    const [inMin, inMax] = [inputRange[0], inputRange[inputRange.length - 1]];
    const [outMin, outMax] = [
      outputRange[0],
      outputRange[outputRange.length - 1],
    ];

    let t = (value - inMin) / (inMax - inMin);
    if (extrapolation === 'clamp') {
      t = Math.max(0, Math.min(1, t));
    }

    return outMin + t * (outMax - outMin);
  },
  Easing: {
    out: (fn) => fn,
    in: (fn) => fn,
    inOut: (fn) => fn,
    cubic: (t) => t,
    quad: (t) => t,
  },
  default: {
    View: 'Animated.View',
  },
};

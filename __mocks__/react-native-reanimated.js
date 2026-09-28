// Minimal mock for react-native-reanimated in tests
module.exports = {
  __esModule: true,
  useReducedMotion: () => false,
  useSharedValue: (initial) => {
    const { useRef } = require('react');
    return useRef({ value: initial }).current;
  },
  useDerivedValue: (fn) => {
    const { useRef } = require('react');
    const updater = useRef(fn);
    updater.current = fn;
    return useRef({
      get value() {
        return updater.current();
      },
    }).current;
  },
  useAnimatedStyle: (fn) => fn(),
  useAnimatedProps: (fn) => fn(),
  useAnimatedRef: () => {
    const { useRef } = require('react');
    const ref = useRef();
    if (!ref.current) {
      const animatedRef = (...args) => {
        if (args.length) animatedRef.current = args[0];
        return animatedRef.current;
      };
      animatedRef.current = null;
      ref.current = animatedRef;
    }
    return ref.current;
  },
  useFrameCallback: (callback, autostart = true) => {
    const { useRef } = require('react');
    const latest = useRef(callback);
    latest.current = callback;
    const ref = useRef();
    if (!ref.current) {
      const frame = {
        isActive: autostart,
        setActive: (active) => {
          frame.isActive = active;
        },
        callback: (info) => {
          if (frame.isActive) latest.current(info);
        },
      };
      ref.current = frame;
    }
    return ref.current;
  },
  useEvent: (callback) => {
    const { useRef } = require('react');
    const latest = useRef(callback);
    latest.current = callback;
    return useRef((event) => latest.current(event.nativeEvent ?? event))
      .current;
  },
  dispatchCommand: jest.fn(),
  cancelAnimation: jest.fn(),
  useAnimatedReaction: jest.fn(),
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
    createAnimatedComponent: (Component) => Component,
  },
};

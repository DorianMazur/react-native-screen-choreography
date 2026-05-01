// Minimal mock for react-native-worklets in tests
module.exports = {
  scheduleOnUI: (worklet, ...args) => worklet(...args),
  scheduleOnRN: (fn, ...args) => fn(...args),
  runOnUI:
    (worklet) =>
    (...args) =>
      worklet(...args),
  runOnJS:
    (fn) =>
    (...args) =>
      fn(...args),
};

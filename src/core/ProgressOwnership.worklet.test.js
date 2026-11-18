const { loadWorkletModule, onUI } = require('../../__fixtures__/worklets');
const { scheduleOnUI } = require('react-native-worklets');
const { withSpring } = require('react-native-reanimated');

jest.mock('react-native-worklets', () => ({
  scheduleOnUI: jest.fn(),
  scheduleOnRN: (fn, ...args) => fn(...args),
}));
jest.mock('react-native-reanimated', () => ({
  cancelAnimation: jest.fn(),
  withSpring: jest.fn(),
}));

test('a reverse spring can settle on the UI thread without transferring its JS owner', () => {
  const { ProgressOwnership, animateOwnedProgress } = loadWorkletModule(
    require.resolve('./ProgressOwnership'),
    require
  );
  const progress = { value: 1 };
  const ownership = new ProgressOwnership({ value: 0 }, progress);
  scheduleOnUI.mockImplementation((worklet) => onUI(worklet, ownership)());
  withSpring.mockImplementation((target, _spring, finish) => {
    finish(true);
    return target;
  });
  ownership.setSession('back');
  const token = ownership.claim('back');
  const complete = jest.fn();
  animateOwnedProgress({
    ownership,
    token,
    sessionId: 'back',
    progress,
    target: 0,
    spring: {},
    onComplete: complete,
  });
  expect(progress.value).toBe(0);
  expect(complete).toHaveBeenCalledWith(token, 'back');
});

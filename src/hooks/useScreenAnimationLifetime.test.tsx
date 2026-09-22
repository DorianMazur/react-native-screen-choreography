import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useScreenAnimationLifetime } from './useScreenAnimationLifetime';

jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (worklet: () => void) => worklet(),
  scheduleOnRN: jest.fn(),
}));

let frames: ((time: number) => void)[];
const trees: ReactTestRenderer[] = [];

beforeEach(() => {
  frames = [];
  jest.clearAllMocks();
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(async () => {
  await act(async () => trees.splice(0).forEach((tree) => tree.unmount()));
  jest.restoreAllMocks();
});

async function mountLifetime() {
  const overlayProgress = makeMutable(0.7);
  let result!: ReturnType<typeof useScreenAnimationLifetime>;
  function Harness() {
    result = useScreenAnimationLifetime(overlayProgress);
    return null;
  }
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Harness />);
  });
  trees.push(tree);
  return {
    overlayProgress,
    get result() {
      return result;
    },
    tree,
    update: () => act(async () => tree.update(<Harness />)),
  };
}

function nextFrame() {
  const frame = frames.shift();
  expect(frame).toBeDefined();
  frame!(0);
}

function flushRN() {
  const pending = [...(scheduleOnRN as jest.Mock).mock.calls];
  (scheduleOnRN as jest.Mock).mockClear();
  for (const [callback, ...args] of pending) callback(...args);
}

test('freezes route progress immediately and resolves only after two UI frames and the RN acknowledgement', async () => {
  const harness = await mountLifetime();
  harness.overlayProgress.value = 0.25;
  expect(harness.result.progress.value).toBe(0.25);
  const suspended = jest.fn();
  const barrier = harness.result.lifetime.suspend(1).then(suspended);
  expect(harness.result.suspended.value).toBe(true);
  harness.overlayProgress.value = 0.2;
  expect(harness.result.progress.value).toBe(0.25);
  expect(harness.overlayProgress.value).toBe(0.2);
  nextFrame();
  await Promise.resolve();
  expect(scheduleOnRN).not.toHaveBeenCalled();
  expect(suspended).not.toHaveBeenCalled();
  nextFrame();
  await Promise.resolve();
  expect(scheduleOnRN).toHaveBeenCalledTimes(1);
  expect(suspended).not.toHaveBeenCalled();
  flushRN();
  await barrier;
  expect(suspended).toHaveBeenCalledTimes(1);
  harness.overlayProgress.value = 0;
  expect(harness.result.progress.value).toBe(0.25);
  harness.result.lifetime.resume(1);
  expect(harness.result.suspended.value).toBe(false);
  expect(harness.result.progress.value).toBe(0);
});

test('stale resume cannot restart a route frozen by a newer return', async () => {
  const harness = await mountLifetime();
  const first = harness.result.lifetime.suspend(1);
  harness.overlayProgress.value = 0.15;
  const second = harness.result.lifetime.suspend(2);
  harness.overlayProgress.value = 0.1;
  harness.result.lifetime.resume(1);
  expect(harness.result.suspended.value).toBe(true);
  expect(harness.result.progress.value).toBe(0.15);
  harness.result.lifetime.resume(2);
  expect(harness.result.progress.value).toBe(0.1);
  while (frames.length) nextFrame();
  flushRN();
  await Promise.all([first, second]);
});

test('screen rerenders preserve the frozen progress and registered lifetime', async () => {
  const harness = await mountLifetime();
  const lifetime = harness.result.lifetime;
  const progress = harness.result.progress;
  const barrier = lifetime.suspend(1);
  harness.overlayProgress.value = 0.2;
  await harness.update();
  expect(harness.result.lifetime).toBe(lifetime);
  expect(harness.result.progress).toBe(progress);
  expect(harness.result.progress.value).toBe(0.7);
  while (frames.length) nextFrame();
  flushRN();
  await barrier;
});

test('external unmount releases pending fences and late UI acknowledgements are harmless', async () => {
  const harness = await mountLifetime();
  const completed = jest.fn();
  const first = harness.result.lifetime.suspend(1).then(completed);
  const second = harness.result.lifetime.suspend(2).then(completed);
  expect(completed).not.toHaveBeenCalled();
  await act(async () => harness.tree.unmount());
  await Promise.all([first, second]);
  expect(completed).toHaveBeenCalledTimes(2);
  while (frames.length) nextFrame();
  flushRN();
  await Promise.resolve();
  expect(completed).toHaveBeenCalledTimes(2);
});

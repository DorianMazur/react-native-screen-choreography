import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  dispatchCommand,
  makeMutable,
  useFrameCallback,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { NativeTransitionHost } from './NativeTransitionHost';
import { createNativePresentation } from '../core/nativePresentation';
import {
  animateOwnedProgress,
  ProgressOwnership,
  startOwnedProgressOnUI,
} from '../core/ProgressOwnership';

jest.mock(
  './ScreenChoreographyViewNativeComponent',
  () => 'ScreenChoreographyView'
);
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('../../__mocks__/react-native-reanimated');
  return {
    ...mock,
    __esModule: true,
    useFrameCallback: jest.fn(mock.useFrameCallback),
  };
});
jest.mock('../core/ProgressOwnership', () => ({
  ...jest.requireActual('../core/ProgressOwnership'),
  startOwnedProgressOnUI: jest.fn(),
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (fn: () => void) => fn(),
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    fn(...args),
}));
let tree: ReactTestRenderer;
let ownership: ProgressOwnership;
beforeEach(() => jest.clearAllMocks());
afterEach(async () => {
  await act(async () => tree?.unmount());
  ownership?.setSession(null);
});
async function setup(armed = true) {
  const progress = makeMutable(0);
  ownership = new ProgressOwnership(makeMutable(0), progress);
  ownership.setSession('A');
  const presentation = createNativePresentation(
    ['host-A'],
    jest.fn(() => true)
  );
  const ready = jest.fn(),
    failed = jest.fn();
  const arm = () =>
    animateOwnedProgress({
      ownership,
      token: ownership.claim('A')!,
      sessionId: 'A',
      progress,
      target: 1,
      spring: {},
      onComplete: jest.fn(),
      presentation,
    });
  if (armed) arm();
  await act(async () => {
    tree = create(
      <NativeTransitionHost
        active
        ownership={ownership}
        progress={progress}
        sessionId="A"
        presentation={presentation}
        onPresentationReady={ready}
        onPresentationFailed={failed}
      />
    );
  });
  const frame = (useFrameCallback as jest.Mock).mock.results.at(-1)!.value;
  const react = () => {
    const [read, apply] = (useAnimatedReaction as jest.Mock).mock.calls.at(-1)!;
    apply(read(), null);
  };
  const ack = async (sessionId = 'A', stage = 'presented') =>
    act(async () => {
      tree.root
        .findByType('ScreenChoreographyView' as React.ElementType)
        .props.onPresentationReady({
          nativeEvent: { sessionId, stage, timestamp: 1 },
        });
      react();
    });
  const tick = async (timestamp: number) =>
    act(async () => frame.callback({ timestamp }));
  return {
    presentation,
    progress,
    arm,
    react,
    ack,
    tick,
    frame,
    ready,
    failed,
  };
}
test('accepts ordered acknowledgments and starts the prepared animation once', async () => {
  const r = await setup();
  const animation = r.presentation.animation.value;
  await r.ack();
  await r.ack('A', 'attached');
  expect(r.presentation.phase.value).toBe(0);
  await r.tick(1);
  expect(dispatchCommand).toHaveBeenCalledWith(
    expect.any(Function),
    'prepare',
    ['A']
  );
  expect(r.presentation.phase.value).toBe(-1);
  await r.ack();
  await r.ack('old', 'attached');
  expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
  await r.ack('A', 'attached');
  expect(r.presentation.phase.value).toBe(1);
  expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
  await r.ack();
  await r.ack();
  await r.tick(2001);
  expect(r.presentation.phase.value).toBe(2);
  expect(startOwnedProgressOnUI).toHaveBeenCalledTimes(1);
  expect(startOwnedProgressOnUI).toHaveBeenCalledWith({
    ...animation,
    owner: ownership.owner,
    handoff: ownership.handoff,
    progress: r.progress,
    sessionId: 'A',
  });
  expect(r.presentation.animation.value).toBeNull();
  expect(r.ready).toHaveBeenCalledTimes(1);
  expect(r.failed).not.toHaveBeenCalled();
});
test('presentation can arrive before the animation is armed without losing the start', async () => {
  const r = await setup(false);
  await r.tick(1);
  await r.ack('A', 'attached');
  await r.ack();
  expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
  r.arm();
  r.react();
  r.react();
  expect(r.presentation.animation.value).toBeNull();
  expect(startOwnedProgressOnUI).toHaveBeenCalledTimes(1);
});
test.each(['cancel', 'replace', 'identity'] as const)(
  '%s between attachment and presentation cannot start stale motion',
  async (reason) => {
    const r = await setup();
    await r.tick(1);
    await r.ack('A', 'attached');
    if (reason === 'cancel') r.presentation.valid.value = false;
    if (reason === 'replace') ownership.setSession('B');
    if (reason === 'identity')
      (r.presentation.validate as jest.Mock).mockReturnValue(false);
    await r.ack();
    expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
    if (reason === 'identity')
      expect(r.failed).toHaveBeenCalledWith('A', 'invalidated');
  }
);
test.each([-1, 1])(
  'timeout in phase %s rejects delayed acknowledgments',
  async (phase) => {
    const r = await setup();
    await r.tick(1);
    if (phase === 1) await r.ack('A', 'attached');
    await r.tick(1001);
    await r.ack('A', 'attached');
    await r.ack();
    await r.tick(2000);
    expect(r.presentation.valid.value).toBe(false);
    expect(r.failed).toHaveBeenCalledTimes(1);
    expect(r.failed).toHaveBeenCalledWith('A', 'timeout');
    expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
  }
);
test('unmount stops the presentation driver', async () => {
  const r = await setup();
  await act(async () => tree.unmount());
  await r.tick(1);
  expect(r.frame.isActive).toBe(false);
  expect(dispatchCommand).not.toHaveBeenCalled();
});

import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable, useAnimatedReaction } from 'react-native-reanimated';
import { NativeTransitionHost } from './NativeTransitionHost';
import {
  createNativePresentation,
  PRESENTATION_TIMEOUT_MS,
} from '../core/nativePresentation';
import {
  animateOwnedProgress,
  ProgressOwnership,
  startOwnedProgressOnUI,
} from '../core/ProgressOwnership';

jest.mock(
  './ScreenChoreographyViewNativeComponent',
  () => 'ScreenChoreographyView'
);
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
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  ownership?.setSession(null);
  jest.useRealTimers();
});
async function setup(armed = true) {
  const progress = makeMutable(0);
  ownership = new ProgressOwnership(makeMutable(0), progress);
  ownership.setSession('A');
  const presentation = createNativePresentation(['host-A']);
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
  return { presentation, progress, arm, react, ack, ready, failed };
}

test('mounts and transfers immediately but starts motion only after its own content is presented', async () => {
  const r = await setup();
  const animation = r.presentation.animation.value;
  expect(r.presentation.phase.value).toBe(1);
  await r.ack('old');
  await r.ack('A', 'attached');
  expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
  await r.ack();
  await r.ack();
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
  await act(async () => jest.advanceTimersByTime(PRESENTATION_TIMEOUT_MS));
  expect(r.failed).not.toHaveBeenCalled();
});

test('presentation before animation arming does not lose the start', async () => {
  const r = await setup(false);
  await r.ack();
  expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
  r.arm();
  r.react();
  r.react();
  expect(startOwnedProgressOnUI).toHaveBeenCalledTimes(1);
});

test.each(['cancel', 'replace'] as const)(
  '%s prevents stale motion',
  async (reason) => {
    const r = await setup();
    if (reason === 'cancel') r.presentation.valid.value = false;
    else ownership.setSession('B');
    await r.ack();
    expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
  }
);

test('a missing presentation times out once and rejects a late acknowledgement', async () => {
  const r = await setup();
  await act(async () => jest.advanceTimersByTime(PRESENTATION_TIMEOUT_MS));
  expect(r.failed).toHaveBeenCalledWith('A', 'timeout');
  expect(r.presentation.valid.value).toBe(false);
  await r.ack();
  await act(async () => jest.advanceTimersByTime(PRESENTATION_TIMEOUT_MS));
  expect(r.failed).toHaveBeenCalledTimes(1);
  expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
});

test('unmount releases the pending presentation timeout', async () => {
  const r = await setup();
  await act(async () => tree.unmount());
  await act(async () => jest.advanceTimersByTime(PRESENTATION_TIMEOUT_MS));
  expect(r.failed).not.toHaveBeenCalled();
});

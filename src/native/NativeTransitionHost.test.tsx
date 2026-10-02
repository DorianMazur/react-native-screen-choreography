import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import {
  dispatchCommand,
  makeMutable,
  useFrameCallback,
  useAnimatedReaction,
  useAnimatedProps,
} from 'react-native-reanimated';
import { NativeTransitionHost } from './NativeTransitionHost';
import type { ReverseHandoffState } from '../core/ReverseTransitionHandoff';
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
    useAnimatedProps: jest.fn(mock.useAnimatedProps),
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
async function setup(
  armed = true,
  input: Partial<React.ComponentProps<typeof NativeTransitionHost>> = {}
) {
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
        {...input}
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
  await r.ack('old');
  expect(r.presentation.phase.value).toBe(0);
  await r.tick(1);
  expect(dispatchCommand).toHaveBeenCalledWith(
    expect.any(Function),
    'prepare',
    ['A']
  );
  expect(r.presentation.phase.value).toBe(-1);
  await r.ack('old');
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
test.each(['ios', 'android'] as const)(
  '%s prepares from the native commit before the first frame callback',
  async (platform) => {
    const originalOS = Platform.OS;
    Platform.OS = platform;
    try {
      const r = await setup();
      expect(
        tree.root.findByType('ScreenChoreographyView' as React.ElementType)
          .props.active
      ).toBe(true);
      await r.ack('old', 'attached');
      expect(r.presentation.phase.value).toBe(0);
      await r.ack('A', 'attached');
      expect(r.presentation.phase.value).toBe(1);
      expect(startOwnedProgressOnUI).not.toHaveBeenCalled();
      await r.tick(1);
      expect(dispatchCommand).not.toHaveBeenCalled();
      await r.ack();
      expect(startOwnedProgressOnUI).toHaveBeenCalledTimes(1);
    } finally {
      Platform.OS = originalOS;
    }
  }
);

test.each([0, -1])(
  'accepts confirmed presentation after a missed attachment in phase %s',
  async (phase) => {
    const r = await setup();
    if (phase === -1) await r.tick(1);
    await r.ack();
    expect(r.presentation.phase.value).toBe(2);
    expect(startOwnedProgressOnUI).toHaveBeenCalledTimes(1);
    await r.ack();
    await r.ack('A', 'attached');
    expect(startOwnedProgressOnUI).toHaveBeenCalledTimes(1);
    expect(r.ready).toHaveBeenCalledTimes(1);
  }
);

test('retries an unacknowledged command without extending its deadline', async () => {
  const r = await setup();
  await r.tick(1);
  await r.tick(18);
  expect(dispatchCommand).toHaveBeenCalledTimes(2);
  await r.tick(1001);
  expect(r.failed).toHaveBeenCalledWith('A', 'timeout');
  await r.tick(1018);
  expect(dispatchCommand).toHaveBeenCalledTimes(2);
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

test('iOS routes return input only for the live operation and releases it on invalidation', async () => {
  const originalOS = Platform.OS;
  Platform.OS = 'ios';
  try {
    const reverseHandoff = makeMutable<ReverseHandoffState | null>(null);
    const r = await setup(true, {
      reverseHandoff,
      returnTargetScreenId: 'list-instance',
    });
    const read = () => (useAnimatedProps as jest.Mock).mock.calls.at(-1)![0]();
    expect(read().inputTarget).toBe('choreography-input:list-instance');
    reverseHandoff.value = {
      sessionId: 'A',
      token: ownership.owner.value,
      targetScreenId: 'list-instance',
      completed: false,
      animationFinished: false,
      navigationPresented: false,
    };
    expect(read().inputTarget).toBe('choreography-input:list-instance');
    reverseHandoff.value = {
      ...reverseHandoff.value,
      token: ownership.owner.value + 1,
    };
    expect(read().inputTarget).toBe('');
    reverseHandoff.value = {
      ...reverseHandoff.value,
      token: ownership.owner.value,
      sessionId: 'old',
      targetScreenId: 'removed-instance',
    };
    expect(read().inputTarget).toBe('choreography-input:list-instance');
    reverseHandoff.value = {
      ...reverseHandoff.value,
      sessionId: 'A',
      completed: true,
    };
    expect(read().inputTarget).toBe('');
    reverseHandoff.value = { ...reverseHandoff.value, completed: false };
    r.presentation.valid.value = false;
    expect(read().inputTarget).toBe('');
  } finally {
    Platform.OS = originalOS;
  }
});

test.each([
  ['ios', true, false, 'choreography-input:list-instance'],
  ['ios', true, true, ''],
  ['ios', false, false, ''],
  ['android', true, false, ''],
] as const)(
  '%s return input respects active=%s gesture=%s',
  async (os, active, gestureEngaged, expected) => {
    const originalOS = Platform.OS;
    Platform.OS = os;
    try {
      await setup(true, {
        active,
        gestureEngaged,
        returnTargetScreenId: 'list-instance',
      });
      const read = (useAnimatedProps as jest.Mock).mock.calls.at(-1)![0];
      expect(read().inputTarget).toBe(expected);
    } finally {
      Platform.OS = originalOS;
    }
  }
);

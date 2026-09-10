import { findNodeHandle, Platform } from 'react-native';
import NativePreparation from '../native/NativeChoreographyPreparation';
import { TransitionCoordinator } from './TransitionCoordinator';
import { ElementRegistry } from './ElementRegistry';
import type { RegisteredElement } from '../types';

jest.mock('../native/NativeChoreographyPreparation', () => ({
  __esModule: true,
  default: { awaitLayout: jest.fn(), cancel: jest.fn() },
}));

const readyResult = { ready: true, sampleCount: 2, elapsedMs: 20 };
const metrics = { pageX: 0, pageY: 20, width: 200, height: 150 };
const config = {
  groupId: 'article',
  sourceScreenId: 'list',
  targetScreenId: 'detail',
  direction: 'forward' as const,
};

describe('native forward preparation', () => {
  let registry: ElementRegistry;
  let coordinator: TransitionCoordinator;
  let ready: boolean;
  let targetNode: { tag: number; measureInWindow: jest.Mock };
  const native = jest.mocked(NativePreparation!);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'android');
    jest
      .spyOn(require('react-native'), 'findNodeHandle')
      .mockImplementation((node: any) => node.tag);
    native.awaitLayout.mockReset().mockResolvedValue(readyResult);
    native.cancel.mockReset();
    ready = true;
    registry = new ElementRegistry();
    const screenRef = { current: { tag: 3 } };
    coordinator = new TransitionCoordinator(
      registry,
      { value: 0 } as any,
      undefined,
      {
        getScreenRef: () => screenRef,
        isScreenReady: () => ready,
      }
    );
    targetNode = {
      tag: 2,
      measureInWindow: jest.fn((cb) => cb(0, 20, 200, 150)),
    };
    const presentation = () => ({
      content: null,
      transition: { renderer: () => null },
    });
    registry.register({
      id: 'title',
      screenId: 'list',
      groupId: 'article',
      ref: { current: { tag: 1 } },
      metrics,
      getPresentation: presentation,
    });
    registry.register({
      id: 'title',
      screenId: 'detail',
      groupId: 'article',
      ref: () => targetNode,
      metrics: null,
      getPresentation: presentation,
    });
  });

  afterEach(() => {
    coordinator.dispose();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('uses one target measurement after native readiness and preserves frozen presentation', async () => {
    const session = await coordinator.startTransition(config);
    expect(native.awaitLayout).toHaveBeenCalledWith(
      expect.any(String),
      3,
      [2],
      500
    );
    expect(targetNode.measureInWindow).toHaveBeenCalledTimes(1);
    expect(session?.state).toBe('active');
    expect(session?.pairs[0]?.targetMetrics).toEqual(metrics);
    expect(findNodeHandle).toHaveBeenCalled();
  });

  test('falls back to Android stabilization when native readiness fails', async () => {
    native.awaitLayout.mockResolvedValue({ ...readyResult, ready: false });
    const pending = coordinator.startTransition(config);
    await jest.runAllTimersAsync();
    expect((await pending)?.state).toBe('active');
    expect(targetNode.measureInWindow).toHaveBeenCalledTimes(5);
  });

  test('an exhausted native deadline ends preparation without another stabilization wait', async () => {
    native.awaitLayout.mockResolvedValue({
      ready: false,
      sampleCount: 20,
      elapsedMs: 500,
    });
    expect(await coordinator.startTransition(config)).toBeNull();
    expect(targetNode.measureInWindow).not.toHaveBeenCalled();
    expect(coordinator.getActiveSession()).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a missing native response reaches the JS deadline and releases preparation', async () => {
    native.awaitLayout.mockImplementation(() => new Promise(() => {}));
    const pending = coordinator.startTransition(config);
    await jest.advanceTimersByTimeAsync(550);
    expect(await pending).toBeNull();
    expect(targetNode.measureInWindow).not.toHaveBeenCalled();
    expect(native.cancel).toHaveBeenCalledTimes(1);
    expect(coordinator.getActiveSession()).toBeNull();
  });

  test('cancellation releases the pending native request without activating', async () => {
    native.awaitLayout.mockImplementation(() => new Promise(() => {}));
    const pending = coordinator.startTransition(config);
    await Promise.resolve();
    coordinator.cancelTransition();
    expect(await pending).toBeNull();
    expect(native.cancel).toHaveBeenCalledTimes(1);
    expect(targetNode.measureInWindow).not.toHaveBeenCalled();
    expect(coordinator.getActiveSession()).toBeNull();
  });

  test('a new content blocker during the native wait prevents activation', async () => {
    native.awaitLayout.mockImplementation(async () => {
      ready = false;
      return readyResult;
    });
    expect(await coordinator.startTransition(config)).toBeNull();
    expect(coordinator.getActiveSession()).toBeNull();
  });

  test('rechecks content readiness after an additional source measurement', async () => {
    const source = registry.getByIdAndScreen('title', 'list', 'article')!;
    registry.register({
      ...source,
      metrics: null,
      ref: () => ({
        measureInWindow: (cb: Function) => {
          ready = false;
          cb(0, 20, 200, 150);
        },
      }),
    } as RegisteredElement);
    expect(await coordinator.startTransition(config)).toBeNull();
    expect(coordinator.getActiveSession()).toBeNull();
  });

  test('a target replaced during source measurement cannot reuse the native acknowledgment', async () => {
    const source = registry.getByIdAndScreen('title', 'list', 'article')!;
    registry.register({
      ...source,
      metrics: null,
      ref: () => ({
        measureInWindow: (cb: Function) => {
          // Same ref callback and numeric tag, different native node object.
          targetNode = { ...targetNode };
          cb(0, 20, 200, 150);
        },
      }),
    } as RegisteredElement);
    expect(await coordinator.startTransition(config)).toBeNull();
  });
});

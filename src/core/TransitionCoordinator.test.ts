import { findNodeHandle } from 'react-native';
import { TransitionCoordinator } from './TransitionCoordinator';
import { ElementRegistry } from './ElementRegistry';
import type {
  ElementMetrics,
  ElementPresentation,
  RegisteredElement,
} from '../types';

jest.mock('../native/NativeChoreographyPreparation', () => ({
  __esModule: true,
  default: null,
}));

const globals = globalThis as typeof globalThis & {
  __screenChoreographyCaptureFabricLayout?: jest.Mock;
  __screenChoreographySubscribeFabricMount?: jest.Mock;
};
const sourceMetrics = { pageX: 10, pageY: 20, width: 50, height: 50 };
const targetMetrics = { pageX: 0, pageY: 0, width: 200, height: 200 };
const transition = { renderer: () => null };
const config = {
  groupId: 'group',
  sourceScreenId: 'list',
  targetScreenId: 'detail',
  direction: 'forward' as const,
};
let registry: ElementRegistry;
let coordinator: TransitionCoordinator;
let ready: boolean;
let capture: jest.Mock;
let layouts: Map<number, ElementMetrics>;
let nextTag: number;
let mountListeners: Set<() => void>;
const screenRefs = new Map([
  ['list', { current: { tag: 100 } }],
  ['detail', { current: { tag: 200 } }],
  ['other', { current: { tag: 300 } }],
]);

function register(
  screenId: string,
  metrics: ElementMetrics,
  overrides: Partial<RegisteredElement> = {}
) {
  const node = { tag: ++nextTag };
  layouts.set(node.tag, metrics);
  const presentation: { current: ElementPresentation } = {
    current: { transition, metadata: { original: true } },
  };
  const element: RegisteredElement = {
    id: 'card',
    screenId,
    groupId: 'group',
    ref: { current: node },
    metrics: null,
    getPresentation: jest.fn(() => presentation.current),
    ...overrides,
  };
  registry.register(element);
  return { element, node, presentation };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest
    .spyOn(require('react-native'), 'findNodeHandle')
    .mockImplementation((node: any) => node.tag);
  registry = new ElementRegistry();
  ready = true;
  nextTag = 0;
  layouts = new Map();
  mountListeners = new Set();
  globals.__screenChoreographySubscribeFabricMount = jest.fn((callback) => {
    mountListeners.add(callback);
    return () => mountListeners.delete(callback);
  });
  capture = jest.fn((_screens: number[], tags: number[]) => {
    const values = tags.map((tag) => layouts.get(tag));
    return values.every(Boolean) ? values : null;
  });
  globals.__screenChoreographyCaptureFabricLayout = capture;
  coordinator = new TransitionCoordinator(registry, { value: 0 } as any, {
    getScreenRef: (id) => screenRefs.get(id),
    isScreenReady: () => ready,
  });
});
afterEach(() => {
  coordinator.dispose();
  delete globals.__screenChoreographyCaptureFabricLayout;
  delete globals.__screenChoreographySubscribeFabricMount;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

async function start(direction: 'forward' | 'backward' = 'forward') {
  const pending = coordinator.startTransition({ ...config, direction });
  await jest.runAllTimersAsync();
  return pending;
}

test.each(['forward', 'backward'] as const)(
  'captures both endpoints in one mounted root for %s',
  async (direction) => {
    register('list', sourceMetrics);
    register('detail', targetMetrics);
    const session = await start(direction);
    expect(session?.state).toBe('active');
    expect(session?.pairs[0]?.sourceMetrics).toEqual(sourceMetrics);
    expect(session?.pairs[0]?.targetMetrics).toEqual(targetMetrics);
    expect(capture).toHaveBeenCalledWith([100, 200], [1, 2]);
    expect(findNodeHandle).toHaveBeenCalled();
  }
);

test('consumes source geometry captured before navigation without re-reading a detached source', async () => {
  const source = register('list', sourceMetrics);
  await coordinator.captureSourceGroup('group', 'list');
  layouts.delete(source.node.tag);
  register('detail', targetMetrics);
  capture.mockClear();
  const session = await start();
  expect(session?.pairs[0]?.sourceMetrics).toEqual(sourceMetrics);
  expect(capture).toHaveBeenCalledWith([200], [2]);
  coordinator.completeTransition();
  expect(await start()).toBeNull(); // The consumed source snapshot cannot be reused.
});

test('does not use stale registry metrics when Fabric capture fails', async () => {
  register('list', sourceMetrics, { metrics: sourceMetrics });
  register('detail', targetMetrics, { metrics: targetMetrics });
  capture.mockReturnValue(null);
  const unavailable = jest.fn();
  const pending = coordinator.startTransition({
    ...config,
    onUnavailable: unavailable,
  });
  await jest.runAllTimersAsync();
  expect(await pending).toBeNull();
  expect(unavailable).toHaveBeenCalledTimes(1);
  expect(coordinator.getActiveSession()).toBeNull();
  expect(jest.getTimerCount()).toBe(0);
});

test('waits for a pending mount and uses its current geometry', async () => {
  register('list', sourceMetrics);
  register('detail', targetMetrics);
  capture.mockReturnValueOnce(null);
  expect((await start())?.pairs[0]?.targetMetrics).toEqual(targetMetrics);
  expect(capture.mock.calls.length).toBeGreaterThan(2);
});

test('transient unavailability during final validation retries instead of cancelling backward navigation', async () => {
  register('list', sourceMetrics);
  register('detail', targetMetrics);
  capture
    .mockReturnValueOnce([sourceMetrics, targetMetrics])
    .mockReturnValueOnce(null);
  expect((await start('backward'))?.state).toBe('active');
});

test('a layout change during presentation capture retries with fresh geometry', async () => {
  register('list', sourceMetrics);
  const target = register('detail', targetMetrics);
  const fresh = { ...targetMetrics, pageY: 99 };
  (target.element.getPresentation as jest.Mock).mockImplementationOnce(() => {
    layouts.set(target.node.tag, fresh);
    return target.presentation.current;
  });
  expect((await start())?.pairs[0]?.targetMetrics).toEqual(fresh);
});

test('freezes both presentations and prefers the departing transition in either direction', async () => {
  const source = register('list', sourceMetrics);
  const target = register('detail', targetMetrics, {
    getPresentation: () => ({ transition: { renderer: () => null } }),
  });
  const session = await start('backward');
  const frozen = session!.pairs[0]!.sourcePresentation;
  source.presentation.current = { transition, metadata: { original: false } };
  expect(frozen.metadata).toEqual({ original: true });
  expect(session!.pairs[0]!.transition).toBe(transition);
  expect(source.element.getPresentation).toHaveBeenCalledTimes(1);
  expect(target.element.ref).toBe(session!.pairs[0]!.target.ref);
});

test('waits for target registration without confusing another screen or group', async () => {
  register('list', sourceMetrics);
  register('other', targetMetrics);
  register('detail', targetMetrics, { groupId: 'other' });
  const pending = coordinator.startTransition(config);
  await Promise.resolve();
  expect(coordinator.getActiveSession()?.state).toBe('measuring');
  register('detail', targetMetrics);
  await jest.runAllTimersAsync();
  expect((await pending)?.pairs).toHaveLength(1);
});

test.each(['cancel', 'dispose'] as const)(
  '%s releases pending capture and cannot reactivate',
  async (action) => {
    register('list', sourceMetrics);
    register('detail', targetMetrics);
    capture.mockReturnValue(null);
    const pending = coordinator.startTransition(config);
    await Promise.resolve();
    if (action === 'cancel') coordinator.cancelTransition();
    else coordinator.dispose();
    await jest.runAllTimersAsync();
    expect(await pending).toBeNull();
    expect(coordinator.getActiveSession()).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  }
);

test('cancellation during registration cannot activate after late registration', async () => {
  register('list', sourceMetrics);
  const pending = coordinator.startTransition(config);
  coordinator.cancelTransition();
  register('detail', targetMetrics);
  await jest.runAllTimersAsync();
  expect(await pending).toBeNull();
});

test('a new content blocker during pairing prevents activation', async () => {
  register('list', sourceMetrics, {
    getPresentation: () => {
      ready = false;
      return { transition };
    },
  });
  register('detail', targetMetrics);
  expect(await start()).toBeNull();
});

test('a replacement native node with the same ref callback cannot use a frozen source', async () => {
  let node = { tag: 1 };
  register('list', sourceMetrics, { ref: () => node });
  await coordinator.captureSourceGroup('group', 'list');
  node = { tag: 3 };
  layouts.set(3, { ...sourceMetrics, pageX: 99 });
  register('detail', targetMetrics);
  expect((await start())?.pairs[0]?.sourceMetrics.pageX).toBe(99);
});

test('replacing a registered endpoint during pairing cannot activate stale refs', async () => {
  register('list', sourceMetrics, {
    getPresentation: () => {
      register('detail', targetMetrics);
      return { transition };
    },
  });
  register('detail', targetMetrics);
  expect(await start()).toBeNull();
});

test('unavailable cleanup cannot clear a session started by navigation fallback', async () => {
  register('list', sourceMetrics);
  const pending = coordinator.startTransition({
    ...config,
    onUnavailable: () => {
      register('detail', targetMetrics);
      coordinator.startTransition(config);
    },
  });
  await jest.runAllTimersAsync();
  expect(await pending).toBeNull();
  expect(coordinator.getActiveSession()?.state).toBe('active');
});

test('refresh captures live geometry without changing frozen presentations', async () => {
  register('list', sourceMetrics);
  const target = register('detail', targetMetrics);
  const session = await start();
  const frozen = session!.pairs[0]!.targetPresentation;
  layouts.set(target.node.tag, { ...targetMetrics, width: 300 });
  await coordinator.refreshActiveSessionMetrics('target');
  expect(coordinator.getActiveSession()!.pairs[0]!.targetMetrics.width).toBe(
    300
  );
  expect(coordinator.getActiveSession()!.pairs[0]!.targetPresentation).toBe(
    frozen
  );
});

test('completion and cancellation release hidden elements and settle on the correct screen', async () => {
  register('list', sourceMetrics);
  register('detail', targetMetrics);
  await start();
  coordinator.getHiddenElements().add('card');
  coordinator.completeTransition();
  expect(coordinator.getHiddenElements().size).toBe(0);
  expect(coordinator.getSettledScreenId()).toBe('detail');
  await start();
  coordinator.getHiddenElements().add('card');
  coordinator.cancelTransition();
  expect(coordinator.getHiddenElements().size).toBe(0);
  expect(coordinator.getSettledScreenId()).toBe('list');
});

test('mount notifications update active target layout and retain frozen presentation', async () => {
  register('list', sourceMetrics);
  const target = register('detail', targetMetrics);
  const session = await start();
  const frozen = session!.pairs[0]!.targetPresentation;
  expect(mountListeners.size).toBe(1);
  layouts.set(target.node.tag, { ...targetMetrics, pageY: 62 });
  [...mountListeners].forEach((notify) => notify());
  expect(coordinator.getActiveSession()!.pairs[0]!.targetMetrics.pageY).toBe(
    62
  );
  expect(coordinator.getActiveSession()!.pairs[0]!.targetPresentation).toBe(
    frozen
  );
  coordinator.completeTransition();
  expect(mountListeners.size).toBe(0);
});

test('late mount notifications cannot update a cancelled session', async () => {
  register('list', sourceMetrics);
  register('detail', targetMetrics);
  await start();
  const notification = [...mountListeners][0]!;
  coordinator.cancelTransition();
  notification();
  expect(coordinator.getActiveSession()).toBeNull();
  expect(mountListeners.size).toBe(0);
});

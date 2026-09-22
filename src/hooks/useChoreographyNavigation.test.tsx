import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import { withSpring } from 'react-native-reanimated';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ProgressOwnership } from '../core/ProgressOwnership';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { ReverseTransitionController } from '../core/ReverseTransitionController';
import { useChoreographyNavigator } from './useChoreographyNavigation';
import type { TransitionSessionData } from '../types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  cancelAnimation: jest.fn(),
  withSpring: jest.fn(() => 0),
}));

test.each([
  ['android', false],
  ['android', true],
  ['ios', false],
] as const)(
  '%s handles forward readiness after destination mounted=%s without reviving a removed Android route',
  async (platform, remainsMounted) => {
    const originalOS = Platform.OS;
    Platform.OS = platform;
    jest.mocked(withSpring).mockClear();
    const frame = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
    const progress = { value: 0 } as ChoreographyContextType['progress'];
    const ownership = new ProgressOwnership(
      { value: 0 } as ChoreographyContextType['progress'],
      progress
    );
    const controller = new NavigationSessionController();
    let targetMounted = true;
    let acknowledgeOverlay!: (ready: boolean) => void;
    const overlay = new Promise<boolean>((resolve) => {
      acknowledgeOverlay = resolve;
    });
    const session: TransitionSessionData = {
      id: 'opening',
      sourceScreenId: 'list-route',
      targetScreenId: 'detail-route',
      groupId: 'trip',
      direction: 'forward',
      state: 'active',
      pairs: [],
      progress,
    };
    const ctx = {
      progress,
      progressOwnership: ownership,
      navigationController: controller,
      activeSession: null,
      pendingTargetScreenId: null,
      captureSourceGroup: jest.fn(async () => {}),
      setPendingTargetScreen: jest.fn(),
      waitForScreenReady: jest.fn(async () => true),
      startTransition: jest.fn(async () => {
        ownership.setSession(session.id);
        controller.setActiveSession(session);
        return session;
      }),
      waitForOverlayReady: jest.fn(() => overlay),
      resolveScreenId: jest.fn(() => (targetMounted ? 'detail-route' : null)),
      setNavigationLineage: jest.fn(),
      cancelTransition: jest.fn(() => {
        ownership.setSession(null);
        controller.setActiveSession(null);
        controller.releaseNavigationLock();
      }),
    } as unknown as ChoreographyContextType;
    let navigation!: ReturnType<typeof useChoreographyNavigator>;
    function Caller() {
      navigation = useChoreographyNavigator({
        currentScreenId: 'list-route',
        currentRouteKey: 'list-route',
        isFocused: true,
        goBack: jest.fn(),
      });
      return null;
    }
    let tree!: ReactTestRenderer;
    try {
      await act(async () => {
        tree = create(
          <ChoreographyContext.Provider value={ctx}>
            <Caller />
          </ChoreographyContext.Provider>
        );
      });
      let pending!: Promise<void>;
      const dispatchNavigation = jest.fn();
      const spring = { duration: 800, dampingRatio: 1 };
      await act(async () => {
        pending = navigation.navigate({
          targetScreenId: 'TripsDetail',
          resolveTargetScreenId: async () => 'detail-route',
          dispatchNavigation,
          options: { transitionConfig: { group: 'trip' }, spring },
        });
      });
      expect(dispatchNavigation).toHaveBeenCalledTimes(1);
      expect(ctx.waitForOverlayReady).toHaveBeenCalledWith('opening');
      expect(withSpring).not.toHaveBeenCalled();
      targetMounted = remainsMounted;
      await act(async () => {
        acknowledgeOverlay(true);
        await pending;
      });
      if (platform === 'android' && !remainsMounted) {
        expect(ctx.cancelTransition).toHaveBeenCalledWith('opening');
        expect(ctx.setNavigationLineage).not.toHaveBeenCalled();
        expect(withSpring).not.toHaveBeenCalled();
        expect(ownership.hasSession).toBe(false);
        expect(controller.isNavigationLocked()).toBe(false);
      } else {
        expect(ctx.cancelTransition).not.toHaveBeenCalled();
        expect(ctx.setNavigationLineage).toHaveBeenCalledWith(
          expect.objectContaining({ targetScreenId: 'detail-route', spring })
        );
        expect(withSpring).toHaveBeenCalledWith(
          1,
          spring,
          expect.any(Function)
        );
      }
    } finally {
      await act(async () => tree?.unmount());
      ownership.setSession(null);
      jest.mocked(withSpring).mockClear();
      frame.mockRestore();
      Platform.OS = originalOS;
    }
  }
);

test('navigation callers share one provider preparation lock', async () => {
  const progress = { value: 0 } as ChoreographyContextType['progress'];
  const progressOwnership = new ProgressOwnership(
    { value: 0 } as ChoreographyContextType['progress'],
    progress
  );
  let releaseMeasurement!: () => void;
  const measurement = new Promise<void>((resolve) => {
    releaseMeasurement = resolve;
  });
  const captureSourceGroup = jest.fn(() => measurement);
  const ctx = {
    progress,
    progressOwnership,
    navigationController: new NavigationSessionController(),
    activeSession: null,
    pendingTargetScreenId: null,
    captureSourceGroup,
  } as unknown as ChoreographyContextType;
  const callers: Array<ReturnType<typeof useChoreographyNavigator>> = [];
  function Caller({ index }: { index: number }) {
    callers[index] = useChoreographyNavigator({
      currentScreenId: 'List',
      isFocused: true,
      goBack: jest.fn(),
    });
    return null;
  }
  let tree!: ReactTestRenderer;
  const pending: Promise<void>[] = [];
  try {
    await act(async () => {
      tree = create(
        <ChoreographyContext.Provider value={ctx}>
          <Caller index={0} />
          <Caller index={1} />
        </ChoreographyContext.Provider>
      );
    });
    await act(async () => {
      for (const caller of callers) {
        pending.push(
          caller.navigate({
            targetScreenId: 'Detail',
            dispatchNavigation: jest.fn(),
            options: { transitionConfig: { group: 'group' } },
          })
        );
      }
    });
    expect(captureSourceGroup).toHaveBeenCalledTimes(1);
  } finally {
    progressOwnership.invalidate();
    releaseMeasurement();
    await Promise.all(pending);
    await act(async () => tree?.unmount());
  }
});

test('queued replay survives focus changes and only its source instance dispatches it', async () => {
  const frames: Array<(timestamp: number) => void> = [];
  const raf = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  const progress = { value: 0 } as ChoreographyContextType['progress'];
  const progressOwnership = new ProgressOwnership(
    { value: 0 } as ChoreographyContextType['progress'],
    progress
  );
  const controller = new NavigationSessionController();
  const dispatchNavigation = jest.fn();
  const captureSourceGroup = jest.fn(async () => {});
  const request = {
    sourceScreenId: 'second-route',
    targetScreenId: 'Detail',
    dispatchNavigation,
    options: { transitionConfig: { group: 'group' } },
  };
  controller.queueNavigation(request);
  const ctx = {
    progress,
    progressOwnership,
    navigationController: controller,
    activeSession: null,
    pendingTargetScreenId: null,
    captureSourceGroup,
    setPendingTargetScreen: jest.fn(),
    waitForScreenReady: jest.fn(async () => false),
  } as unknown as ChoreographyContextType;
  function Caller({
    screenId,
    focused = true,
  }: {
    screenId: string;
    focused?: boolean;
  }) {
    useChoreographyNavigator({
      currentScreenId: screenId,
      isFocused: focused,
      goBack: () => {},
    });
    return null;
  }
  function render(focused = true) {
    return (
      <ChoreographyContext.Provider value={ctx}>
        <Caller screenId="first-route" />
        <Caller screenId="second-route" focused={focused} />
      </ChoreographyContext.Provider>
    );
  }
  let tree!: ReactTestRenderer;
  try {
    await act(async () => {
      tree = create(render());
    });
    await act(async () => tree.update(render(false)));
    await act(async () => tree.update(render()));
    while (frames.length) {
      const frameBatch = frames.splice(0);
      await act(async () => {
        frameBatch.forEach((frame) => frame(0));
      });
    }
    expect(dispatchNavigation).toHaveBeenCalledTimes(1);
    expect(captureSourceGroup).toHaveBeenCalledWith('group', 'second-route');
    expect(captureSourceGroup).toHaveBeenCalledTimes(1);
    expect(controller.peekQueuedNavigation()).toBeNull();
  } finally {
    await act(async () => tree?.unmount());
    raf.mockRestore();
  }
});

test('a tap queued during removal replays as soon as the return is interruptible, despite the settling lock', async () => {
  const frames: Array<(timestamp: number) => void> = [];
  const raf = jest
    .spyOn(global, 'requestAnimationFrame')
    .mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  const progress = { value: 0.2 } as ChoreographyContextType['progress'];
  const ownership = new ProgressOwnership(
    { value: 0 } as ChoreographyContextType['progress'],
    progress
  );
  ownership.setSession('return');
  const controller = new NavigationSessionController();
  controller.acquireNavigationLock('detail');
  const reverse = new ReverseTransitionController();
  let resolveRemoval!: (result: {
    removed: boolean;
    presented: boolean;
  }) => void;
  const completion = reverse.start({
    sessionId: 'return',
    sourceScreenId: 'detail',
    targetScreenId: 'list',
    commitNavigation: () =>
      new Promise((resolve) => {
        resolveRemoval = resolve;
      }),
    animate: () => {},
    settleToTarget: jest.fn(),
    cancel: jest.fn(),
    handoff: () => {
      ownership.setSession(null);
      controller.releaseNavigationLock();
    },
    isCurrent: () => ownership.isSession('return'),
  });
  reverse.commitNearEndpoint('return');
  const dispatchNavigation = jest.fn();
  const ctx = {
    progress,
    progressOwnership: ownership,
    navigationController: controller,
    reverseController: reverse,
    interruptibleReturnSessionId: null,
    activeSession: {
      id: 'return',
      sourceScreenId: 'detail',
      targetScreenId: 'list',
      direction: 'backward',
      state: 'active',
    },
    pendingTargetScreenId: null,
    captureSourceGroup: jest.fn(async () => {}),
    setPendingTargetScreen: jest.fn(),
    waitForScreenReady: jest.fn(async () => false),
  } as unknown as ChoreographyContextType;
  let navigation!: ReturnType<typeof useChoreographyNavigator>;
  function Caller() {
    navigation = useChoreographyNavigator({
      currentScreenId: 'list',
      isFocused: true,
      goBack: jest.fn(),
    });
    return null;
  }
  const render = () => (
    <ChoreographyContext.Provider value={{ ...ctx }}>
      <Caller />
    </ChoreographyContext.Provider>
  );
  let tree!: ReactTestRenderer;
  try {
    await act(async () => {
      tree = create(render());
    });
    await act(async () =>
      navigation.navigate({
        targetScreenId: 'detail',
        dispatchNavigation,
        options: { transitionConfig: { group: 'group' } },
      })
    );
    expect(dispatchNavigation).not.toHaveBeenCalled();
    expect(controller.peekQueuedNavigation()).not.toBeNull();
    await act(async () => {
      resolveRemoval({ removed: true, presented: false });
    });
    expect(controller.isNavigationLocked()).toBe(true);
    await act(async () => {
      ctx.interruptibleReturnSessionId = 'return';
      tree.update(render());
    });
    while (frames.length) {
      await act(async () => {
        frames.splice(0).forEach((frame) => frame(0));
      });
    }
    await completion;
    expect(dispatchNavigation).toHaveBeenCalledTimes(1);
    expect(controller.peekQueuedNavigation()).toBeNull();
  } finally {
    await act(async () => tree?.unmount());
    reverse.dispose();
    raf.mockRestore();
  }
});

describe('Back preparation ownership', () => {
  test('Back from an unrelated route does not claim another route transition', async () => {
    const progress = { value: 0.5 } as ChoreographyContextType['progress'];
    const progressOwnership = new ProgressOwnership(
      { value: 0 } as ChoreographyContextType['progress'],
      progress
    );
    progressOwnership.setSession('session');
    const version = progressOwnership.version;
    const goBack = jest.fn();
    const ctx = {
      progress,
      progressOwnership,
      navigationController: new NavigationSessionController(),
      reverseController: { owns: () => false },
      activeSession: {
        id: 'session',
        sourceScreenId: 'list',
        targetScreenId: 'detail',
        direction: 'forward',
      },
    } as unknown as ChoreographyContextType;
    let navigation!: ReturnType<typeof useChoreographyNavigator>;
    function Caller() {
      navigation = useChoreographyNavigator({
        currentScreenId: 'other-route',
        isFocused: true,
        goBack,
      });
      return null;
    }
    let tree!: ReactTestRenderer;
    try {
      await act(async () => {
        tree = create(
          <ChoreographyContext.Provider value={ctx}>
            <Caller />
          </ChoreographyContext.Provider>
        );
      });
      await act(async () => navigation.goBack());
      expect(goBack).toHaveBeenCalledTimes(1);
      expect(progressOwnership.version).toBe(version);
      expect(progress.value).toBe(0.5);
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test.each(['frame', 'measurement'])(
    'replacement at %s cannot schedule or complete stale work',
    async (boundary) => {
      const frames: Array<(timestamp: number) => void> = [];
      const raf = jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      let resolveMetrics!: () => void;
      const progress = { value: 0.8 } as ChoreographyContextType['progress'];
      const progressOwnership = new ProgressOwnership(
        { value: 0 } as ChoreographyContextType['progress'],
        progress
      );
      progressOwnership.setSession('A');
      const navigateBack = jest.fn();
      const ctx = {
        progress,
        progressOwnership,
        navigationController: new NavigationSessionController(),
        reverseController: { owns: () => false },
        activeSession: {
          id: 'A',
          direction: 'forward',
          sourceScreenId: 'List',
          targetScreenId: 'Detail',
        },
        getNavigationLineage: jest.fn(),
        refreshActiveSessionMetrics: jest.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveMetrics = resolve;
            })
        ),
        completeTransition: jest.fn(),
        cancelTransition: jest.fn(),
        commitReverseTransition: jest.fn(),
      } as unknown as ChoreographyContextType;
      let navigation!: ReturnType<typeof useChoreographyNavigator>;
      function Harness() {
        navigation = useChoreographyNavigator({
          currentScreenId: 'Detail',
          isFocused: true,
          goBack: navigateBack,
        });
        return null;
      }
      let tree!: ReactTestRenderer;
      await act(async () => {
        tree = create(
          <ChoreographyContext.Provider value={ctx}>
            <Harness />
          </ChoreographyContext.Provider>
        );
      });
      let pending!: Promise<void>;
      await act(async () => {
        pending = navigation.goBack();
      });
      expect(navigateBack).not.toHaveBeenCalled();
      const replace = () => {
        progressOwnership.setSession('B');
        progress.value = 0.65;
      };
      if (boundary === 'frame') replace();
      await act(async () => {
        frames.shift()!(0);
      });
      if (boundary === 'measurement') replace();
      if (boundary !== 'frame')
        await act(async () => {
          resolveMetrics();
          await pending;
        });
      await act(async () => {
        frames.splice(0).forEach((callback) => callback(0));
        await pending;
      });
      expect(progress.value).toBe(0.65);
      expect(withSpring).not.toHaveBeenCalled();
      expect(ctx.completeTransition).not.toHaveBeenCalled();
      expect(ctx.cancelTransition).not.toHaveBeenCalled();
      expect(ctx.commitReverseTransition).not.toHaveBeenCalled();
      expect(navigateBack).not.toHaveBeenCalled();
      await act(async () => tree.unmount());
      raf.mockRestore();
    }
  );
});

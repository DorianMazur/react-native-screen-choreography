import React, { StrictMode, useContext, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { animateOwnedProgress } from '../core/ProgressOwnership';
import { FullWindowOverlay } from 'react-native-screens';
import { ChoreographyProvider } from './ChoreographyProvider';
import { NativeTransitionHost } from '../native/NativeTransitionHost';
import { useChoreographyNavigator } from '../hooks/useChoreographyNavigation';
import { useChoreographyControls } from '../hooks/useChoreographyProgress';
import { ScreenIdContext } from '../core/screenIdContext';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';

jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  return {
    ...jest.requireActual('../../__mocks__/react-native-reanimated'),
    __esModule: true,
    useSharedValue: (value: number) => useRef({ value }).current,
    useReducedMotion: jest.fn(() => false),
    cancelAnimation: jest.fn(),
  };
});

jest.mock('react-native-screens', () => ({
  FullWindowOverlay: jest.fn(
    ({ children }: { children: React.ReactNode }) => children
  ),
}));

jest.mock('react-native-teleport', () => ({
  PortalProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock(
  '../native/ScreenChoreographyViewNativeComponent',
  () => 'ScreenChoreographyView'
);

const fabricGlobals = globalThis as typeof globalThis & {
  __screenChoreographyCaptureFabricLayout?: jest.Mock;
  __screenChoreographySubscribeFabricMount?: jest.Mock;
};
function FabricScreens() {
  const actions = useContext(ChoreographyActionsContext)!;
  useLayoutEffect(() => {
    const releases = ['list', 'detail', 'source-route'].map((id) => {
      actions.setScreenReady(id, true);
      return actions.registerScreenPresentation(id, {
        current: { tag: 100 },
      } as any);
    });
    return () => releases.forEach((release) => release());
  }, [actions]);
  return null;
}

describe('ChoreographyProvider lifecycle', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
    Platform.OS = 'ios';
    jest
      .spyOn(require('react-native'), 'findNodeHandle')
      .mockImplementation((node: any) => node.tag);
    fabricGlobals.__screenChoreographyCaptureFabricLayout = jest.fn(
      (_screens, tags) =>
        tags.map(() => ({ pageX: 10, pageY: 20, width: 100, height: 100 }))
    );
    fabricGlobals.__screenChoreographySubscribeFabricMount = jest.fn(
      () => () => {}
    );
    jest.mocked(FullWindowOverlay).mockClear();
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    delete fabricGlobals.__screenChoreographyCaptureFabricLayout;
    delete fabricGlobals.__screenChoreographySubscribeFabricMount;
    jest.restoreAllMocks();
  });

  test.each(['forward', 'backward'] as const)(
    'Android reduced motion completes %s without mounting an overlay or waiting for native presentation',
    async (direction) => {
      Platform.OS = 'android';
      jest.mocked(useReducedMotion).mockReturnValue(true);
      jest.useFakeTimers();
      let context!: ChoreographyContextType;
      let tree!: ReactTestRenderer;
      const renderer = jest.fn(() => null);
      const onTransitionEnd = jest.fn();
      const navigateBack = jest.fn(async () => ({
        removed: true,
        presented: false,
      }));
      function Consumer() {
        context = useContext(ChoreographyContext)!;
        return null;
      }
      try {
        await act(async () => {
          tree = create(
            <ChoreographyProvider onTransitionEnd={onTransitionEnd}>
              <FabricScreens />
              <Consumer />
            </ChoreographyProvider>
          );
        });
        for (const screenId of ['list', 'detail']) {
          context.registerElement({
            id: 'card',
            groupId: 'group',
            screenId,
            metrics: null,
            ref: { current: { tag: screenId === 'list' ? 1 : 2 } },
            getPresentation: () => ({ transition: { renderer } }),
          });
        }
        context.navigationController.acquireNavigationLock('list');
        await act(async () => {
          const preparing = context.startTransition({
            groupId: 'group',
            direction,
            sourceScreenId: direction === 'forward' ? 'list' : 'detail',
            targetScreenId: direction === 'forward' ? 'detail' : 'list',
          });
          await jest.runAllTimersAsync();
          await preparing;
        });
        const sessionId = context.activeSession!.id;
        expect(context.activeSession!.reducedMotion).toBe(true);
        expect(context.progress.value).toBe(direction === 'forward' ? 1 : 0);
        expect(tree.root.findByType(NativeTransitionHost).props.active).toBe(
          false
        );
        expect(renderer).not.toHaveBeenCalled();
        // No host acknowledgement or timeout is needed for a direct transfer.
        expect(await context.waitForOverlayReady(sessionId)).toBe(true);
        const token = context.progressOwnership.claim(sessionId)!;
        await act(async () => {
          if (direction === 'backward') {
            await context.commitReverseTransition({
              sessionId,
              token,
              navigateBack,
            });
          } else {
            animateOwnedProgress({
              ownership: context.progressOwnership,
              token,
              sessionId,
              progress: context.progress,
              target: 1,
              spring: {},
              onComplete: () => context.completeTransition(sessionId),
            });
          }
        });
        expect(navigateBack).toHaveBeenCalledTimes(
          direction === 'backward' ? 1 : 0
        );
        expect(context.activeSession).toBeNull();
        expect(context.progressOwnership.hasSession).toBe(false);
        expect(context.navigationController.isNavigationLocked()).toBe(false);
        expect(onTransitionEnd).toHaveBeenCalledTimes(1);
      } finally {
        await act(async () => tree?.unmount());
        jest.useRealTimers();
      }
    }
  );

  test.each(['forward', 'backward'] as const)(
    'scrolling the return destination settles a %s session only after removal',
    async (direction) => {
      jest.useFakeTimers();
      let context!: ChoreographyContextType;
      const controls: Record<string, () => void> = {};
      function Controls({ screenId }: { screenId: string }) {
        context = useContext(ChoreographyContext)!;
        controls[screenId] = useChoreographyControls().settleTransition;
        return null;
      }
      let tree!: ReactTestRenderer;
      try {
        await act(async () => {
          tree = create(
            <ChoreographyProvider>
              <FabricScreens />
              {['list', 'detail'].map((screenId) => (
                <ScreenIdContext.Provider key={screenId} value={screenId}>
                  <Controls screenId={screenId} />
                </ScreenIdContext.Provider>
              ))}
            </ChoreographyProvider>
          );
        });
        for (const screenId of ['list', 'detail']) {
          context.registerElement({
            id: 'card',
            groupId: 'group',
            screenId,
            metrics: { pageX: 24, pageY: 200, width: 320, height: 450 },
            ref: { current: { tag: screenId === 'list' ? 1 : 2 } },
            getPresentation: () => ({ transition: { renderer: () => null } }),
          });
        }
        await act(async () => {
          const preparing = context.startTransition({
            groupId: 'group',
            direction,
            sourceScreenId: direction === 'forward' ? 'list' : 'detail',
            targetScreenId: direction === 'forward' ? 'detail' : 'list',
          });
          await jest.runAllTimersAsync();
          await preparing;
        });
        const sessionId = context.activeSession!.id;
        let removed!: (result: {
          removed: boolean;
          presented: boolean;
        }) => void;
        const settleToTarget = jest.fn(() => {
          context.progress.value = 0;
        });
        const handoff = jest.fn(() => context.completeTransition(sessionId));
        const completion = context.reverseController.start({
          sessionId,
          sourceScreenId: 'detail',
          targetScreenId: 'list',
          isCurrent: () => context.progressOwnership.isSession(sessionId),
          commitNavigation: () =>
            new Promise((resolve) => {
              removed = resolve;
            }),
          animate: () => {},
          settleToTarget,
          handoff,
          cancel: jest.fn(),
        });
        context.progress.value = 0.2;
        context.reverseController.commitNearEndpoint(sessionId);
        await act(async () => controls.list!());
        expect(settleToTarget).not.toHaveBeenCalled();
        await act(async () => removed({ removed: true, presented: true }));
        await act(async () => controls.detail!());
        expect(settleToTarget).not.toHaveBeenCalled();
        await act(async () => controls.list!());
        await completion;
        expect(settleToTarget).toHaveBeenCalledTimes(1);
        expect(handoff).toHaveBeenCalledTimes(1);
        expect(context.progress.value).toBe(0);
        expect(context.activeSession).toBeNull();
        await act(async () => controls.list!());
        expect(handoff).toHaveBeenCalledTimes(1);
      } finally {
        await act(async () => tree?.unmount());
        jest.useRealTimers();
      }
    }
  );

  test.each([false, true])(
    'retains overlay readiness across a Fabric mount update (host already acknowledged: %s)',
    async (hostAlreadyAcknowledged) => {
      jest.useFakeTimers();
      let context!: ChoreographyContextType;
      let tree!: ReactTestRenderer;
      const onTransitionEnd = jest.fn();
      function Consumer() {
        context = useContext(ChoreographyContext)!;
        return null;
      }
      try {
        await act(async () => {
          tree = create(
            <ChoreographyProvider onTransitionEnd={onTransitionEnd}>
              <FabricScreens />
              <Consumer />
            </ChoreographyProvider>
          );
        });
        for (const screenId of ['list', 'detail']) {
          context.registerElement({
            id: 'card',
            groupId: 'group',
            screenId,
            metrics: null,
            ref: { current: { tag: screenId === 'list' ? 1 : 2 } },
            getPresentation: () => ({ transition: { renderer: () => null } }),
          });
        }
        await act(async () => {
          const preparing = context.startTransition({
            groupId: 'group',
            sourceScreenId: 'list',
            targetScreenId: 'detail',
            direction: 'forward',
          });
          await jest.runAllTimersAsync();
          await preparing;
        });
        const sessionId = context.activeSession!.id;
        const host = tree.root.findByType(NativeTransitionHost);
        if (hostAlreadyAcknowledged) {
          await act(async () => host.props.onPresentationReady());
        }
        const ready = jest.fn();
        const waiting = context.waitForOverlayReady(sessionId).then(ready);
        fabricGlobals.__screenChoreographyCaptureFabricLayout!.mockReturnValue([
          { pageX: 10, pageY: 80, width: 100, height: 100 },
        ]);
        await act(async () => {
          const notifyMount =
            fabricGlobals.__screenChoreographySubscribeFabricMount!.mock
              .calls[0]![0];
          notifyMount();
        });
        expect(context.activeSession!.pairs[0]!.targetMetrics.pageY).toBe(80);
        if (!hostAlreadyAcknowledged) {
          await act(async () => host.props.onPresentationReady());
        }
        await act(async () => {
          await jest.advanceTimersByTimeAsync(151);
          await waiting;
        });
        expect(ready).toHaveBeenCalledWith(true);
        expect(context.isOverlayPresented!(sessionId)).toBe(true);
        expect(context.activeSession?.id).toBe(sessionId);
        expect(onTransitionEnd).not.toHaveBeenCalled();
      } finally {
        await act(async () => tree?.unmount());
        jest.useRealTimers();
      }
    }
  );

  test('unregistering the preparation source invalidates its dispatch and queue', async () => {
    let context!: ChoreographyContextType;
    let navigation!: ReturnType<typeof useChoreographyNavigator>;
    let tree!: ReactTestRenderer;
    function Caller() {
      context = useContext(ChoreographyContext)!;
      navigation = useChoreographyNavigator({
        currentScreenId: 'source-route',
        isFocused: true,
        goBack: jest.fn(),
      });
      return null;
    }
    const dispatchNavigation = jest.fn();
    try {
      await act(async () => {
        tree = create(
          <ChoreographyProvider>
            <FabricScreens />
            <Caller />
          </ChoreographyProvider>
        );
      });
      context.registerElement({
        id: 'card',
        groupId: 'group',
        screenId: 'source-route',
        metrics: null,
        ref: { current: { tag: 1 } },
        getPresentation: () => ({
          content: null,
          transition: { renderer: () => null },
        }),
      });
      fabricGlobals.__screenChoreographyCaptureFabricLayout!.mockReturnValue(
        null
      );
      let pending!: Promise<void>;
      await act(async () => {
        pending = navigation.navigate({
          targetScreenId: 'Detail',
          dispatchNavigation,
          options: { transitionConfig: { group: 'group' } },
        });
      });
      context.navigationController.queueNavigation({
        sourceScreenId: 'source-route',
        targetScreenId: 'Other',
        dispatchNavigation,
      });
      await act(async () => context.unregisterScreen('source-route'));
      await act(async () => {
        fabricGlobals.__screenChoreographyCaptureFabricLayout!.mockReturnValue([
          { pageX: 0, pageY: 0, width: 100, height: 100 },
        ]);
        await pending;
      });
      expect(dispatchNavigation).not.toHaveBeenCalled();
      expect(context.navigationController.isNavigationLocked()).toBe(false);
      expect(context.navigationController.peekQueuedNavigation()).toBeNull();
      expect(context.pendingTargetScreenId).toBeNull();
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test.each([
    [false, 'native', 'complete'],
    [true, 'native', 'complete'],
    [false, 'timeout', 'complete'],
    [true, 'timeout', 'complete'],
    [false, 'native', 'cancel'],
    [true, 'native', 'cancel'],
  ] as const)(
    'keeps the host mounted with StrictMode=%s, readiness=%s, outcome=%s',
    async (strict, readiness, outcome) => {
      jest.useFakeTimers();
      let context!: ChoreographyContextType;
      let tree: ReactTestRenderer | undefined;
      const onTransitionStart = jest.fn();
      const onTransitionEnd = jest.fn();
      const controlRenders = jest.fn();
      let settle!: () => void;
      function Controls() {
        settle = useChoreographyControls().settleTransition;
        controlRenders();
        return null;
      }

      function Consumer() {
        context = useContext(ChoreographyContext)!;
        return null;
      }

      try {
        await act(async () => {
          const provider = (
            <ChoreographyProvider
              onTransitionStart={onTransitionStart}
              onTransitionEnd={onTransitionEnd}
            >
              <FabricScreens />
              <Consumer />
              <ScreenIdContext.Provider value="detail">
                <Controls />
              </ScreenIdContext.Provider>
            </ChoreographyProvider>
          );
          tree = create(
            strict ? <StrictMode>{provider}</StrictMode> : provider
          );
        });

        const persistentHost = tree!.root.findByType(NativeTransitionHost);
        const persistentNativeView = tree!.root.findByType(
          'ScreenChoreographyView' as React.ElementType
        );
        expect(persistentHost.props.active).toBe(false);
        const initialSettle = settle;
        controlRenders.mockClear();
        const metrics = { pageX: 10, pageY: 20, width: 100, height: 100 };
        for (const screenId of ['list', 'detail']) {
          context.registerElement({
            id: 'card',
            groupId: 'group',
            screenId,
            ref: { current: { tag: screenId === 'list' ? 1 : 2 } },
            metrics,
            getPresentation: () => ({
              transition: {
                renderer: () => null,
              },
            }),
          });
        }
        const hidden = context.isElementHidden('card', 'list', 'group');
        const unrelated = context.isElementHidden('other', 'list', 'other');
        const writes = [hidden, unrelated].map((sharedValue) => {
          let value = 0;
          const write = jest.fn((next: number) => {
            value = next;
          });
          Object.defineProperty(sharedValue, 'value', {
            get: () => value,
            set: write,
          });
          return write;
        });
        let session: ChoreographyContextType['activeSession'] = null;
        await act(async () => {
          const preparation = context.startTransition({
            groupId: 'group',
            sourceScreenId: 'list',
            targetScreenId: 'detail',
            direction: 'forward',
          });
          await jest.runAllTimersAsync();
          session = await preparation;
        });

        expect(session).not.toBeNull();
        expect(context.activeSession).toBe(session);
        expect(tree!.root.findByType(NativeTransitionHost)).toBe(
          persistentHost
        );
        expect(persistentHost.props.active).toBe(true);
        expect(
          tree!.root.findByType('ScreenChoreographyView' as React.ElementType)
        ).toBe(persistentNativeView);
        const sessionId = context.activeSession!.id;
        expect(context.progressOwnership.isSession(sessionId)).toBe(true);
        expect(onTransitionStart).toHaveBeenCalledTimes(1);
        expect(onTransitionStart).toHaveBeenCalledWith(session);
        // React layout is ready, but the native overlay has not presented yet.
        expect(hidden.value).toBe(0);
        expect(writes[0]).not.toHaveBeenCalled();
        expect(writes[1]).not.toHaveBeenCalled();
        expect(context.isOverlayPresented!(sessionId)).toBe(false);
        const ready = jest.fn();
        const waiting = context.waitForOverlayReady(sessionId).then(ready);
        if (readiness === 'native') {
          await act(async () => {
            const host = tree!.root.findByType(NativeTransitionHost);
            host.props.onPresentationReady();
            host.props.onPresentationReady();
            await waiting;
          });
        } else {
          await act(async () => jest.advanceTimersByTimeAsync(149));
          expect(hidden.value).toBe(0);
          expect(ready).not.toHaveBeenCalled();
          await act(async () => {
            await jest.advanceTimersByTimeAsync(1);
            await waiting;
          });
        }

        expect(ready).toHaveBeenCalledWith(true);
        expect(hidden.value).toBe(0);
        expect(writes[0]).not.toHaveBeenCalled();
        expect(writes[1]).not.toHaveBeenCalled();

        expect(controlRenders).not.toHaveBeenCalled();
        expect(settle).toBe(initialSettle);
        await act(async () => {
          if (outcome === 'cancel') {
            context.cancelTransition(sessionId);
          } else {
            initialSettle();
          }
        });

        expect(context.activeSession).toBeNull();
        expect(tree!.root.findByType(NativeTransitionHost)).toBe(
          persistentHost
        );
        expect(persistentHost.props.active).toBe(false);
        expect(
          tree!.root.findByType('ScreenChoreographyView' as React.ElementType)
        ).toBe(persistentNativeView);
        expect(FullWindowOverlay).not.toHaveBeenCalled();
        expect(context.progressOwnership.hasSession).toBe(false);
        expect(onTransitionEnd).toHaveBeenCalledTimes(1);
        expect(onTransitionEnd).toHaveBeenCalledWith(session);
        expect(hidden.value).toBe(0);
        expect(writes[0]).not.toHaveBeenCalled();
        expect(writes[1]).not.toHaveBeenCalled();
      } finally {
        await act(async () => tree?.unmount());
        jest.useRealTimers();
      }
    }
  );
});

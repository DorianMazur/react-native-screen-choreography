import React, { StrictMode, useContext, useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { animateOwnedProgress } from '../core/ProgressOwnership';
import { ChoreographyProvider } from './ChoreographyProvider';
import { NativeTransitionHost } from '../native/NativeTransitionHost';
import { requestMeasuredLayout } from '../core/measuredLayout';
import type { ElementMetrics, NodeHandleRef } from '../types';
import { PRESENTATION_TIMEOUT_MS } from '../core/nativePresentation';
import { useChoreographyNavigator } from '../hooks/useChoreographyNavigation';
import { useChoreographyControls } from '../hooks/useChoreographyProgress';
import { ScreenIdContext } from '../core/screenIdContext';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyActionsType,
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

jest.mock('react-native-teleport', () => ({
  PortalProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock(
  '../native/ScreenChoreographyViewNativeComponent',
  () => 'ScreenChoreographyView'
);

jest.mock('../core/measuredLayout', () => ({
  requestMeasuredLayout: jest.fn(),
}));

function elementRefs(tag: number) {
  const ref = { current: { tag } };
  return {
    ref,
    measurementRef: Object.assign(() => ref.current, ref) as any,
  };
}

function measuredSnapshot(
  entries: Parameters<typeof requestMeasuredLayout>[0]['entries'],
  metrics: ElementMetrics
) {
  const nodeFor = (ref: NodeHandleRef) =>
    typeof ref === 'function' ? ref() : ref.current;
  const refs = entries.map((entry) => entry.ref);
  const nodes = refs.map(nodeFor);
  const measurementRefs = entries.map((entry) => entry.measurementRef);
  return {
    metrics: new Map(entries.map((entry) => [entry.id, { ...metrics }])),
    isCurrent: () =>
      entries.every(
        (entry, index) =>
          Boolean(nodes[index]) &&
          entry.ref === refs[index] &&
          entry.measurementRef === measurementRefs[index] &&
          nodeFor(entry.ref) === nodes[index] &&
          entry.measurementRef.current === nodes[index]
      ),
  };
}

function ReadyScreens() {
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
  let measuredMetrics: ElementMetrics;

  beforeEach(() => {
    jest.mocked(useReducedMotion).mockReturnValue(false);
    Platform.OS = 'ios';
    measuredMetrics = { pageX: 10, pageY: 20, width: 100, height: 100 };
    jest
      .mocked(requestMeasuredLayout)
      .mockImplementation(async (request) =>
        request.isCurrent()
          ? measuredSnapshot(request.entries, measuredMetrics)
          : null
      );
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    jest.mocked(requestMeasuredLayout).mockReset();
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
              <ReadyScreens />
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
            ...elementRefs(screenId === 'list' ? 1 : 2),
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
              <ReadyScreens />
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
            ...elementRefs(screenId === 'list' ? 1 : 2),
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
    'retains overlay readiness across a target layout update (host already acknowledged: %s)',
    async (hostAlreadyAcknowledged) => {
      jest.useFakeTimers();
      let context!: ChoreographyContextType;
      let actions!: ChoreographyActionsType;
      let tree!: ReactTestRenderer;
      const onTransitionEnd = jest.fn();
      function Consumer() {
        context = useContext(ChoreographyContext)!;
        actions = useContext(ChoreographyActionsContext)!;
        return null;
      }
      try {
        await act(async () => {
          tree = create(
            <ChoreographyProvider onTransitionEnd={onTransitionEnd}>
              <ReadyScreens />
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
            ...elementRefs(screenId === 'list' ? 1 : 2),
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
          await act(async () => host.props.onPresentationReady(sessionId));
        }
        const ready = jest.fn();
        const waiting = context.waitForOverlayReady(sessionId).then(ready);
        measuredMetrics = { pageX: 10, pageY: 80, width: 100, height: 100 };
        await act(async () => {
          actions.onElementLayout!('card', 'detail', 'group');
        });
        expect(context.activeSession!.pairs[0]!.targetMetrics.pageY).toBe(80);
        if (!hostAlreadyAcknowledged) {
          await act(async () => host.props.onPresentationReady(sessionId));
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

  test.each([
    'late-native',
    'ui-ready',
    'timeout',
    'invalidated',
    'cancel',
    'unmount',
  ] as const)(
    'bounds delayed presentation without losing readiness: %s',
    async (outcome) => {
      jest.useFakeTimers();
      let context!: ChoreographyContextType;
      let tree!: ReactTestRenderer;
      function Consumer() {
        context = useContext(ChoreographyContext)!;
        return null;
      }
      try {
        await act(async () => {
          tree = create(
            <ChoreographyProvider>
              <ReadyScreens />
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
            ...elementRefs(screenId === 'list' ? 1 : 2),
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
        const session = context.activeSession!;
        const presentation = session.presentation!;
        const host = tree.root.findByType(NativeTransitionHost).props;
        const ready = jest.fn();
        const unavailable = jest.fn();
        const waiting = context
          .waitForOverlayReady(session.id, unavailable)
          .then(ready);
        presentation.phase.value = 1;
        await act(async () => jest.advanceTimersByTimeAsync(500));
        expect(ready).not.toHaveBeenCalled();
        expect(context.activeSession?.id).toBe(session.id);
        expect(context.isElementHidden('card', 'list', 'group').value).toBe(0);
        if (outcome === 'unmount') await act(async () => tree.unmount());
        await act(async () => {
          if (outcome === 'late-native' || outcome === 'ui-ready') {
            presentation.phase.value = 2;
            if (outcome === 'late-native') host.onPresentationReady(session.id);
          }
          if (outcome === 'invalidated') {
            presentation.valid.value = false;
            host.onPresentationFailed(session.id, 'invalidated');
          }
          if (outcome === 'cancel') context.cancelTransition(session.id);
          // Explicit failure/cancellation settles immediately, without the deadline.
          if (outcome !== 'ui-ready' && outcome !== 'timeout') await waiting;
          await jest.advanceTimersByTimeAsync(PRESENTATION_TIMEOUT_MS - 500);
          await waiting;
        });
        const success = outcome === 'late-native' || outcome === 'ui-ready';
        expect(ready).toHaveBeenCalledTimes(1);
        expect(ready).toHaveBeenCalledWith(success);
        if (success) {
          expect(context.isOverlayPresented!(session.id)).toBe(true);
          expect(context.activeSession?.id).toBe(session.id);
        }
        if (outcome === 'timeout' || outcome === 'invalidated') {
          expect(unavailable).toHaveBeenCalledTimes(1);
          expect(unavailable).toHaveBeenCalledWith({
            reason: outcome === 'timeout' ? 'timeout' : 'invalidated',
            phase: 'transferring',
            contentReady: true,
            hostAcknowledged: false,
          });
          expect(context.activeSession).toBeNull();
          await act(async () => host.onPresentationReady(session.id));
          expect(context.activeSession).toBeNull();
          expect(context.isOverlayPresented!(session.id)).toBe(false);
        } else {
          expect(unavailable).not.toHaveBeenCalled();
        }
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
            <ReadyScreens />
            <Caller />
          </ChoreographyProvider>
        );
      });
      context.registerElement({
        id: 'card',
        groupId: 'group',
        screenId: 'source-route',
        metrics: null,
        ...elementRefs(1),
        getPresentation: () => ({
          content: null,
          transition: { renderer: () => null },
        }),
      });
      let finishMeasurement!: (
        snapshot: Awaited<ReturnType<typeof requestMeasuredLayout>>
      ) => void;
      let request!: Parameters<typeof requestMeasuredLayout>[0];
      const cancelMeasurement = jest.fn(() => {
        request.cancellers.delete(cancelMeasurement);
        finishMeasurement(null);
      });
      jest.mocked(requestMeasuredLayout).mockImplementationOnce((options) => {
        request = options;
        return new Promise((resolve) => {
          finishMeasurement = resolve;
          options.cancellers.add(cancelMeasurement);
        });
      });
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
      expect(cancelMeasurement).toHaveBeenCalledTimes(1);
      expect(request.isCurrent()).toBe(false);
      await act(async () => {
        finishMeasurement(measuredSnapshot(request.entries, measuredMetrics));
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
              <ReadyScreens />
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
            ...elementRefs(screenId === 'list' ? 1 : 2),
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
            host.props.onPresentationReady(sessionId);
            host.props.onPresentationReady(sessionId);
            await waiting;
          });
        } else {
          await act(async () =>
            jest.advanceTimersByTimeAsync(PRESENTATION_TIMEOUT_MS - 1)
          );
          expect(hidden.value).toBe(0);
          expect(ready).not.toHaveBeenCalled();
          await act(async () => {
            await jest.advanceTimersByTimeAsync(1);
            await waiting;
          });
        }

        expect(ready).toHaveBeenCalledWith(readiness === 'native');
        if (readiness === 'timeout') {
          expect(context.progress.value).toBe(1);
          expect(context.navigationController.isNavigationLocked()).toBe(false);
        }
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

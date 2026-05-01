import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  useSharedValue,
  makeMutable,
  type SharedValue,
} from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import type {
  ChoreographyDebugConfig,
  RegisteredElement,
  TransitionSessionData,
} from './types';
import { ElementRegistry } from './ElementRegistry';
import { NativeTransitionHost } from './NativeTransitionHost';
import { TransitionCoordinator } from './TransitionCoordinator';
import { TransitionOverlay } from './TransitionOverlay';
import {
  ChoreographyContext,
  ChoreographyActionsContext,
  type ChoreographyContextType,
  type ChoreographyActionsType,
} from './hooks/ChoreographyContext';
import {
  debugTrace,
  setDebugCoalesce,
  setDebugEnabled,
  setDebugLevel,
} from './debug/logger';

function TransitionHostPortal({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{children}</FullWindowOverlay>;
  }

  return (
    <View
      collapsable={false}
      pointerEvents={active ? 'box-none' : 'none'}
      style={styles.androidPortal}
    >
      {children}
    </View>
  );
}

interface ChoreographyProviderProps {
  children: React.ReactNode;
  /**
   * Enable debug logging. `true` enables info/warn/error. Pass a structured
   * object for level/category control (e.g. `{ level: 'trace' }` for
   * per-frame measurement traces).
   */
  debug?: ChoreographyDebugConfig;
  /** Called when a transition session becomes active with pairs resolved */
  onTransitionStart?: (session: TransitionSessionData) => void;
  /** Called when a transition session completes or is cancelled */
  onTransitionEnd?: (session: TransitionSessionData) => void;
}
function resolveDebugConfig(debug: ChoreographyDebugConfig | undefined) {
  if (!debug) {
    return { enabled: false, level: 'info' as const, coalesce: true };
  }
  if (debug === true) {
    return { enabled: true, level: 'info' as const, coalesce: true };
  }
  return {
    enabled: true,
    level: debug.level ?? 'info',
    coalesce: !debug.logEveryFrame,
  };
}

export function ChoreographyProvider({
  children,
  debug = false,
  onTransitionStart,
  onTransitionEnd,
}: ChoreographyProviderProps) {
  const progress = useSharedValue(0);
  const [activeSession, setActiveSession] =
    useState<TransitionSessionData | null>(null);
  const [pendingTargetScreenId, setPendingTargetScreenId] = useState<
    string | null
  >(null);
  const isOverlayActive =
    activeSession?.state === 'active' && activeSession.pairs.length > 0;
  const activeSessionRef = useRef<TransitionSessionData | null>(null);
  const hostPresentedSessionIdRef = useRef<string | null>(null);
  const overlayContentReadySessionIdRef = useRef<string | null>(null);

  // Refs let the coordinator closure see the latest callbacks without
  // re-creating it on each render.
  const onTransitionStartRef = useRef(onTransitionStart);
  onTransitionStartRef.current = onTransitionStart;
  const onTransitionEndRef = useRef(onTransitionEnd);
  onTransitionEndRef.current = onTransitionEnd;
  const overlayWaitersRef = useRef<Map<string, Set<() => void>>>(new Map());

  const syncHiddenElements = useCallback(() => {
    const hidden = coordinatorRef.current!.getHiddenElements();
    for (const [key, sv] of hiddenMapRef.current) {
      sv.value = hidden.has(key) ? 1 : 0;
    }
  }, []);
  const resolveOverlayWaiters = useCallback((sessionId: string) => {
    const waiters = overlayWaitersRef.current.get(sessionId);
    if (!waiters) {
      return;
    }

    overlayWaitersRef.current.delete(sessionId);
    waiters.forEach((resolve) => resolve());
  }, []);
  const resolveOverlayWaitersIfReady = useCallback(
    (sessionId: string) => {
      if (
        hostPresentedSessionIdRef.current === sessionId &&
        overlayContentReadySessionIdRef.current === sessionId
      ) {
        resolveOverlayWaiters(sessionId);
      }
    },
    [resolveOverlayWaiters]
  );
  const screenStateRef = useRef<
    Map<string, { ready: boolean; waiters: Set<() => void> }>
  >(new Map());

  const registryRef = useRef<ElementRegistry | null>(null);
  const coordinatorRef = useRef<TransitionCoordinator | null>(null);

  const hiddenMapRef = useRef<Map<string, SharedValue<number>>>(new Map());

  if (!registryRef.current) {
    registryRef.current = new ElementRegistry();
  }
  if (!coordinatorRef.current) {
    coordinatorRef.current = new TransitionCoordinator(
      registryRef.current,
      progress
    );
    coordinatorRef.current.setOnSessionChange((session) => {
      const previousSession = activeSessionRef.current;
      activeSessionRef.current = session;
      setActiveSession(session);
      hostPresentedSessionIdRef.current = null;
      overlayContentReadySessionIdRef.current = null;

      if (!session) {
        if (previousSession) {
          onTransitionEndRef.current?.(previousSession);
        }
        overlayWaitersRef.current.clear();
        setPendingTargetScreenId(null);
        syncHiddenElements();
        return;
      }

      if (
        session.state === 'active' &&
        session.pairs.length > 0 &&
        previousSession?.state !== 'active'
      ) {
        onTransitionStartRef.current?.(session);
      }

      // Hiding is driven by handleOverlayReady / handleHostPresentationReady
      // so reals are hidden the same frame the overlay first paints. Hiding
      // here would cause a one-frame blank flash at transition start.
    });
  }

  useEffect(() => {
    const resolved = resolveDebugConfig(debug);
    setDebugEnabled(resolved.enabled);
    setDebugLevel(resolved.level);
    setDebugCoalesce(resolved.coalesce);
    registryRef.current?.setDebug(resolved.enabled);
    coordinatorRef.current?.setDebug(resolved.enabled);
  }, [debug]);

  const registerElement = useCallback((element: RegisteredElement) => {
    registryRef.current!.register(element);
  }, []);

  const unregisterElement = useCallback((id: string, screenId: string) => {
    registryRef.current!.unregister(id, screenId);
    const key = `${id}:${screenId}`;
    const sv = hiddenMapRef.current.get(key);
    if (sv) {
      if (coordinatorRef.current?.getHiddenElements().has(key)) {
        // Element is hidden by an active transition; preserve the SV so a
        // re-mounting element gets back the same value=1 and never flashes.
        return;
      }
      sv.value = 0;
      hiddenMapRef.current.delete(key);
    }
  }, []);

  const setScreenReady = useCallback((screenId: string, ready: boolean) => {
    let state = screenStateRef.current.get(screenId);
    if (!state) {
      state = { ready: false, waiters: new Set() };
      screenStateRef.current.set(screenId, state);
    }

    state.ready = ready;

    debugTrace(
      () =>
        `[Provider] Screen ready=${ready} screen="${screenId}" waiters=${state.waiters.size}`
    );

    if (ready) {
      const waiters = [...state.waiters];
      state.waiters.clear();
      waiters.forEach((resolve) => resolve());
    }
  }, []);

  const unregisterScreen = useCallback((screenId: string) => {
    let state = screenStateRef.current.get(screenId);
    if (!state) {
      state = { ready: false, waiters: new Set() };
      screenStateRef.current.set(screenId, state);
    }

    state.ready = false;

    debugTrace(
      () =>
        `[Provider] Screen unregistered screen="${screenId}" preservingWaiters=${state.waiters.size}`
    );
  }, []);

  const waitForScreenReady = useCallback(async (screenId: string) => {
    let state = screenStateRef.current.get(screenId);
    if (!state) {
      state = { ready: false, waiters: new Set() };
      screenStateRef.current.set(screenId, state);
    }

    if (state.ready) {
      debugTrace(
        () => `[Provider] waitForScreenReady immediate screen="${screenId}"`
      );
      return;
    }

    const waitStartedAt = Date.now();

    debugTrace(
      () => `[Provider] waitForScreenReady start screen="${screenId}"`
    );

    await new Promise<void>((resolve) => {
      const currentState = screenStateRef.current.get(screenId)!;
      const onReady = () => {
        clearTimeout(timeoutId);
        debugTrace(
          () =>
            `[Provider] waitForScreenReady resolved screen="${screenId}" duration=${Date.now() - waitStartedAt}ms`
        );
        resolve();
      };
      const timeoutId = setTimeout(() => {
        currentState.waiters.delete(onReady);
        debugTrace(
          () =>
            `[Provider] waitForScreenReady timeout screen="${screenId}" duration=${Date.now() - waitStartedAt}ms`
        );
        resolve();
      }, 700);

      currentState.waiters.add(onReady);
    });
  }, []);

  const isElementHidden = useCallback(
    (id: string, screenId: string): SharedValue<number> => {
      const key = `${id}:${screenId}`;
      let sv = hiddenMapRef.current.get(key);
      if (!sv) {
        const isHidden = coordinatorRef.current?.getHiddenElements().has(key)
          ? 1
          : 0;
        sv = makeMutable(isHidden) as SharedValue<number>;
        hiddenMapRef.current.set(key, sv);
      }
      return sv;
    },
    []
  );

  const startTransition = useCallback(
    async (config: {
      groupId: string;
      sourceScreenId: string;
      targetScreenId: string;
      direction: 'forward' | 'backward';
    }) => {
      return coordinatorRef.current!.startTransition(config);
    },
    []
  );

  const preMeasureGroup = useCallback(
    async (groupId: string, screenId: string) => {
      await coordinatorRef.current!.preMeasureGroup(groupId, screenId);
    },
    []
  );

  const refreshActiveSessionMetrics = useCallback(
    async (side: 'source' | 'target') => {
      await coordinatorRef.current!.refreshActiveSessionMetrics(side);
    },
    []
  );

  const waitForOverlayReady = useCallback(
    async (sessionId: string) => {
      if (
        hostPresentedSessionIdRef.current === sessionId &&
        overlayContentReadySessionIdRef.current === sessionId
      ) {
        return;
      }

      await new Promise<void>((resolve) => {
        let waiters = overlayWaitersRef.current.get(sessionId);
        if (!waiters) {
          waiters = new Set();
          overlayWaitersRef.current.set(sessionId, waiters);
        }

        const onReady = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        // 150ms safety net for slow Android frames; also hides reals so the
        // spring never animates with originals visible behind the overlay.
        const timeoutId = setTimeout(() => {
          waiters!.delete(onReady);
          syncHiddenElements();
          resolve();
        }, 150);

        waiters.add(onReady);
        resolveOverlayWaitersIfReady(sessionId);
      });
    },
    [resolveOverlayWaitersIfReady, syncHiddenElements]
  );

  const completeTransition = useCallback(() => {
    coordinatorRef.current!.completeTransition();
  }, []);

  const cancelTransition = useCallback(() => {
    coordinatorRef.current!.cancelTransition();
  }, []);

  const setPendingTargetScreen = useCallback((screenId: string | null) => {
    setPendingTargetScreenId(screenId);
  }, []);

  const handleOverlayReady = useCallback(
    (sessionId: string) => {
      const session = activeSessionRef.current;
      // Ignore stale acks from a previous session's layout effect.
      if (!session || session.id !== sessionId) {
        syncHiddenElements();
        return;
      }
      if (session.state === 'active' && session.pairs.length > 0) {
        overlayContentReadySessionIdRef.current = sessionId;
        syncHiddenElements();
        resolveOverlayWaitersIfReady(sessionId);
        return;
      }
      syncHiddenElements();
    },
    [resolveOverlayWaitersIfReady, syncHiddenElements]
  );

  const handleHostPresentationReady = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session || session.state !== 'active' || session.pairs.length === 0) {
      return;
    }

    hostPresentedSessionIdRef.current = session.id;
    syncHiddenElements();
    resolveOverlayWaitersIfReady(session.id);
  }, [resolveOverlayWaitersIfReady, syncHiddenElements]);

  const actionsValue = useMemo<ChoreographyActionsType>(
    () => ({
      registerElement,
      unregisterElement,
      isElementHidden,
      setScreenReady,
      unregisterScreen,
      waitForScreenReady,
    }),
    [
      registerElement,
      unregisterElement,
      isElementHidden,
      setScreenReady,
      unregisterScreen,
      waitForScreenReady,
    ]
  );

  const contextValue: ChoreographyContextType = useMemo(
    () => ({
      registerElement,
      unregisterElement,
      setScreenReady,
      unregisterScreen,
      waitForScreenReady,
      isElementHidden,
      activeSession,
      pendingTargetScreenId,
      setPendingTargetScreen,
      progress,
      preMeasureGroup,
      refreshActiveSessionMetrics,
      waitForOverlayReady,
      startTransition,
      completeTransition,
      cancelTransition,
      debug,
    }),
    [
      registerElement,
      unregisterElement,
      setScreenReady,
      unregisterScreen,
      waitForScreenReady,
      isElementHidden,
      activeSession,
      pendingTargetScreenId,
      setPendingTargetScreen,
      progress,
      preMeasureGroup,
      refreshActiveSessionMetrics,
      waitForOverlayReady,
      startTransition,
      completeTransition,
      cancelTransition,
      debug,
    ]
  );

  return (
    <ChoreographyActionsContext.Provider value={actionsValue}>
      <ChoreographyContext.Provider value={contextValue}>
        {children}
        <TransitionHostPortal
          active={Boolean(isOverlayActive && activeSession)}
        >
          <NativeTransitionHost
            active={Boolean(isOverlayActive && activeSession)}
            onPresentationReady={handleHostPresentationReady}
          >
            <TransitionOverlay
              session={activeSession}
              progress={progress}
              onReady={handleOverlayReady}
            />
          </NativeTransitionHost>
        </TransitionHostPortal>
      </ChoreographyContext.Provider>
    </ChoreographyActionsContext.Provider>
  );
}

const styles = StyleSheet.create({
  androidPortal: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
});

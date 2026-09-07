import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';
import { PortalProvider } from 'react-native-teleport';
import type {
  ChoreographyDebugConfig,
  ChoreographyNavigationLineage,
  RegisteredElement,
  TransitionSessionData,
} from '../types';
import { ElementRegistry } from '../core/ElementRegistry';
import { ElementVisibilityRegistry } from '../core/ElementVisibilityRegistry';
import { ChoreographyProgressProvider } from '../core/ChoreographyProgressContext';
import { NativeTransitionHost } from '../native/NativeTransitionHost';
import { TransitionCoordinator } from '../core/TransitionCoordinator';
import { TransitionOverlay } from '../core/TransitionOverlay';
import {
  ChoreographyContext,
  ChoreographyActionsContext,
  ChoreographyControlsContext,
  type ChoreographyContextType,
  type ChoreographyActionsType,
} from '../core/ChoreographyContext';
import {
  debugTrace,
  setDebugCoalesce,
  setDebugEnabled,
  setDebugLevel,
} from '../debug/logger';
import { getElementIdentityKey } from '../core/elementIdentity';
import { ScreenReadinessRegistry } from '../core/ScreenReadinessRegistry';
import { ProgressOwnership, setOwnedProgress } from '../core/ProgressOwnership';
import { getScreenRole } from '../core/screenVisibility';
import { NavigationSessionController } from '../core/NavigationSessionController';

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

interface OverlayWaiter {
  resolve: (ready: boolean) => void;
  timeoutId: ReturnType<typeof setTimeout>;
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
  const progressOwner = useSharedValue(0);
  const [progressOwnership] = useState(
    () => new ProgressOwnership(progressOwner, progress)
  );
  const [navigationController] = useState(
    () => new NavigationSessionController()
  );
  const [activeSession, setActiveSession] =
    useState<TransitionSessionData | null>(null);
  const [pendingTargetScreenId, setPendingTargetScreenId] = useState<
    string | null
  >(null);
  const [pendingSourceScreenId, setPendingSourceScreenId] = useState<
    string | null
  >(null);
  const isOverlayActive =
    activeSession?.state === 'active' && activeSession.pairs.length > 0;
  const activeSessionRef = useRef<TransitionSessionData | null>(null);
  const hostPresentedSessionIdRef = useRef<string | null>(null);
  const overlayContentReadySessionIdRef = useRef<string | null>(null);
  const navigationLineageRef = useRef<
    Map<string, ChoreographyNavigationLineage>
  >(new Map());

  // Refs let the coordinator closure see the latest callbacks without
  // re-creating it on each render.
  const onTransitionStartRef = useRef(onTransitionStart);
  onTransitionStartRef.current = onTransitionStart;
  const onTransitionEndRef = useRef(onTransitionEnd);
  onTransitionEndRef.current = onTransitionEnd;
  const overlayWaitersRef = useRef<Map<string, Set<OverlayWaiter>>>(new Map());

  const syncHiddenElements = useCallback(() => {
    const hidden = coordinatorRef.current!.getHiddenElements();
    hiddenMapRef.current.sync(hidden);
  }, []);
  const settleOverlayWaiters = useCallback(
    (sessionId: string, ready: boolean) => {
      const waiters = overlayWaitersRef.current.get(sessionId);
      if (!waiters) {
        return;
      }

      overlayWaitersRef.current.delete(sessionId);
      waiters.forEach((waiter) => {
        clearTimeout(waiter.timeoutId);
        waiter.resolve(ready);
      });
    },
    []
  );
  const cancelAllOverlayWaiters = useCallback(() => {
    for (const sessionId of overlayWaitersRef.current.keys()) {
      settleOverlayWaiters(sessionId, false);
    }
  }, [settleOverlayWaiters]);
  const resolveOverlayWaitersIfReady = useCallback(
    (sessionId: string) => {
      if (
        hostPresentedSessionIdRef.current === sessionId &&
        overlayContentReadySessionIdRef.current === sessionId
      ) {
        settleOverlayWaiters(sessionId, true);
      }
    },
    [settleOverlayWaiters]
  );
  const screenReadinessRef = useRef(new ScreenReadinessRegistry());
  const screenNamesRef = useRef(new Map<string, string>());

  const registryRef = useRef<ElementRegistry | null>(null);
  const coordinatorRef = useRef<TransitionCoordinator | null>(null);

  const hiddenMapRef = useRef(new ElementVisibilityRegistry());

  if (!registryRef.current) {
    registryRef.current = new ElementRegistry();
  }
  if (!coordinatorRef.current) {
    coordinatorRef.current = new TransitionCoordinator(
      registryRef.current,
      progress,
      (screenId) => screenNamesRef.current.get(screenId) ?? screenId
    );
  }

  useLayoutEffect(() => {
    const coordinator = coordinatorRef.current!;
    const screenReadiness = screenReadinessRef.current;
    const screenNames = screenNamesRef.current;
    const hiddenMap = hiddenMapRef.current;
    const navigationLineage = navigationLineageRef.current;
    coordinator.setOnSessionChange((session) => {
      navigationController.setActiveSession(session);
      progressOwnership.setSession(session?.id ?? null);
      const previousSession = activeSessionRef.current;
      activeSessionRef.current = session;
      setActiveSession(session);
      if (previousSession && previousSession.id !== session?.id) {
        settleOverlayWaiters(previousSession.id, false);
      }
      hostPresentedSessionIdRef.current = null;
      overlayContentReadySessionIdRef.current = null;

      if (!session) {
        navigationController.releaseNavigationLock();
        if (previousSession) {
          onTransitionEndRef.current?.(previousSession);
        }
        setPendingTargetScreenId(null);
        setPendingSourceScreenId(null);
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

    return () => {
      navigationController.setActiveSession(null);
      navigationController.releaseNavigationLock();
      navigationController.clearQueuedNavigation();
      progressOwnership.setSession(null);
      progressOwnership.invalidate();
      cancelAllOverlayWaiters();
      screenReadiness.dispose();
      screenNames.clear();
      coordinator.dispose();
      hiddenMap.clear();
      navigationLineage.clear();
    };
  }, [
    cancelAllOverlayWaiters,
    navigationController,
    progressOwnership,
    settleOverlayWaiters,
    syncHiddenElements,
  ]);

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

  const unregisterElement = useCallback(
    (id: string, screenId: string, groupId: string | undefined) => {
      registryRef.current!.unregister(id, screenId, groupId);
      const key = getElementIdentityKey(screenId, groupId, id);
      if (coordinatorRef.current?.getHiddenElements().has(key)) {
        return;
      }
      hiddenMapRef.current.delete(key);
    },
    []
  );

  const setScreenReady = useCallback(
    (screenId: string, ready: boolean, screenName?: string) => {
      if (screenName) screenNamesRef.current.set(screenId, screenName);
      screenReadinessRef.current.setReady(screenId, ready);

      debugTrace(
        () =>
          `[Provider] Screen ready=${ready} screen="${screenId}" blockers=${screenReadinessRef.current.getBlockerCount(screenId)}`
      );
    },
    []
  );

  const unregisterScreen = useCallback(
    (screenId: string) => {
      screenReadinessRef.current.unregister(screenId);
      screenNamesRef.current.delete(screenId);
      navigationLineageRef.current.delete(screenId);
      if (
        navigationController.peekQueuedNavigation()?.sourceScreenId === screenId
      ) {
        navigationController.clearQueuedNavigation();
      }
      if (
        navigationController.getNavigationSourceScreenId() === screenId &&
        coordinatorRef.current?.getActiveSession()?.state !== 'active'
      ) {
        progressOwnership.invalidate();
        coordinatorRef.current?.cancelTransition();
        navigationController.releaseNavigationLock();
        setPendingTargetScreenId(null);
        setPendingSourceScreenId(null);
      }

      debugTrace(
        () =>
          `[Provider] Screen unregistered screen="${screenId}" blockers=${screenReadinessRef.current.getBlockerCount(screenId)}`
      );
    },
    [navigationController, progressOwnership]
  );

  const resolveScreenId = useCallback(
    (screenId: string, preferredInstanceId?: string) => {
      const screenNames = screenNamesRef.current;
      if (screenNames.has(screenId)) return screenId;
      if (
        preferredInstanceId &&
        screenNames.get(preferredInstanceId) === screenId
      ) {
        return preferredInstanceId;
      }
      const candidates = [...screenNames].filter(
        ([, name]) => name === screenId
      );
      return candidates.length === 1 ? candidates[0]![0] : null;
    },
    []
  );

  const acquireScreenBlocker = useCallback((screenId: string) => {
    debugTrace(() => `[Provider] Screen blocker acquired screen="${screenId}"`);
    const release = screenReadinessRef.current.acquire(screenId);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      release();
      debugTrace(
        () =>
          `[Provider] Screen blocker released screen="${screenId}" remaining=${screenReadinessRef.current.getBlockerCount(screenId)}`
      );
    };
  }, []);

  const getSettledScreenId = useCallback(
    () => coordinatorRef.current?.getSettledScreenId() ?? null,
    []
  );

  const setNavigationLineage = useCallback(
    (lineage: ChoreographyNavigationLineage) => {
      navigationLineageRef.current.set(lineage.targetScreenId, lineage);
    },
    []
  );

  const getNavigationLineage = useCallback((screenId: string) => {
    return navigationLineageRef.current.get(screenId) ?? null;
  }, []);

  const waitForScreenReady = useCallback(async (screenId: string) => {
    if (screenReadinessRef.current.isReady(screenId)) {
      debugTrace(
        () => `[Provider] waitForScreenReady immediate screen="${screenId}"`
      );
      return true;
    }

    const waitStartedAt = Date.now();

    debugTrace(
      () => `[Provider] waitForScreenReady start screen="${screenId}"`
    );

    const ready = await screenReadinessRef.current.waitForReady(screenId, 700);
    debugTrace(
      () =>
        `[Provider] waitForScreenReady ${ready ? 'resolved' : 'timeout'} screen="${screenId}" blockers=${screenReadinessRef.current.getBlockerCount(screenId)} duration=${Date.now() - waitStartedAt}ms`
    );
    return ready;
  }, []);

  const isElementHidden = useCallback(
    (id: string, screenId: string, groupId?: string): SharedValue<number> => {
      const key = getElementIdentityKey(screenId, groupId, id);
      return hiddenMapRef.current.get(
        key,
        coordinatorRef.current?.getHiddenElements().has(key) ?? false
      );
    },
    []
  );

  const startTransition = useCallback(
    async (config: {
      groupId: string;
      sourceScreenId: string;
      targetScreenId: string;
      direction: 'forward' | 'backward';
      onUnavailable?: (sessionId: string) => void;
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
        return true;
      }

      return new Promise<boolean>((resolve) => {
        let waiters = overlayWaitersRef.current.get(sessionId);
        if (!waiters) {
          waiters = new Set();
          overlayWaitersRef.current.set(sessionId, waiters);
        }

        // 150ms safety net for slow Android frames; also hides reals so the
        // spring never animates with originals visible behind the overlay.
        const timeoutId = setTimeout(() => {
          waiters!.delete(waiter);
          if (waiters!.size === 0) {
            overlayWaitersRef.current.delete(sessionId);
          }
          if (activeSessionRef.current?.id === sessionId) {
            syncHiddenElements();
          }
          resolve(true);
        }, 150);

        const waiter: OverlayWaiter = { resolve, timeoutId };
        waiters.add(waiter);
        resolveOverlayWaitersIfReady(sessionId);
      });
    },
    [resolveOverlayWaitersIfReady, syncHiddenElements]
  );

  const completeTransition = useCallback((sessionId?: string) => {
    const session = activeSessionRef.current;
    if (sessionId && session?.id !== sessionId) {
      return;
    }
    if (session?.direction === 'backward') {
      navigationLineageRef.current.delete(session.sourceScreenId);
    }
    coordinatorRef.current?.completeTransition(sessionId);
  }, []);

  const cancelTransition = useCallback((sessionId?: string) => {
    const session = activeSessionRef.current;
    if (sessionId && session?.id !== sessionId) {
      return;
    }
    if (session?.direction === 'forward') {
      navigationLineageRef.current.delete(session.targetScreenId);
    }
    coordinatorRef.current?.cancelTransition(sessionId);
  }, []);

  const setPendingTargetScreen = useCallback(
    (screenId: string | null, sourceScreenId?: string) => {
      setPendingTargetScreenId(screenId);
      setPendingSourceScreenId(screenId ? (sourceScreenId ?? null) : null);
    },
    []
  );

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

  const settleTransition = useCallback(
    (screenId: string) => {
      const session = activeSessionRef.current;
      const role = getScreenRole(session, screenId);
      if (!session || role === 'inactive') return;
      const sessionId = session.id;
      const token = progressOwnership.claim(sessionId);
      if (token === null) return;
      const expanded =
        session.direction === 'forward' ? role === 'target' : role === 'source';
      setOwnedProgress(
        progressOwnership,
        token,
        sessionId,
        progress,
        expanded ? 1 : 0,
        (completedToken, completedId) => {
          if (!progressOwnership.isCurrent(completedToken, completedId)) return;
          if (role === 'source') cancelTransition(completedId);
          else completeTransition(completedId);
        }
      );
    },
    [cancelTransition, completeTransition, progress, progressOwnership]
  );
  const controlsValue = useMemo(
    () => ({ progress, settleTransition }),
    [progress, settleTransition]
  );

  const actionsValue = useMemo<ChoreographyActionsType>(
    () => ({
      registerElement,
      unregisterElement,
      isElementHidden,
      setScreenReady,
      unregisterScreen,
      acquireScreenBlocker,
      getSettledScreenId,
      waitForScreenReady,
    }),
    [
      registerElement,
      unregisterElement,
      isElementHidden,
      setScreenReady,
      unregisterScreen,
      acquireScreenBlocker,
      getSettledScreenId,
      waitForScreenReady,
    ]
  );

  const contextValue: ChoreographyContextType = useMemo(
    () => ({
      registerElement,
      unregisterElement,
      setScreenReady,
      resolveScreenId,
      unregisterScreen,
      acquireScreenBlocker,
      waitForScreenReady,
      isElementHidden,
      activeSession,
      pendingTargetScreenId,
      pendingSourceScreenId,
      setPendingTargetScreen,
      setNavigationLineage,
      getNavigationLineage,
      progress,
      progressOwnership,
      navigationController,
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
      resolveScreenId,
      unregisterScreen,
      acquireScreenBlocker,
      waitForScreenReady,
      isElementHidden,
      activeSession,
      pendingTargetScreenId,
      pendingSourceScreenId,
      setPendingTargetScreen,
      setNavigationLineage,
      getNavigationLineage,
      progress,
      progressOwnership,
      navigationController,
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
    <PortalProvider>
      <ChoreographyActionsContext.Provider value={actionsValue}>
        <ChoreographyControlsContext.Provider value={controlsValue}>
          <ChoreographyContext.Provider value={contextValue}>
            <ChoreographyProgressProvider>
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
            </ChoreographyProgressProvider>
          </ChoreographyContext.Provider>
        </ChoreographyControlsContext.Provider>
      </ChoreographyActionsContext.Provider>
    </PortalProvider>
  );
}

const styles = StyleSheet.create({
  androidPortal: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
  },
});

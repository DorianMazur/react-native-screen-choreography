import type { PreparationTrace } from '../core/preparationTrace';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { PortalProvider } from 'react-native-teleport';
import type {
  ChoreographyDebugConfig,
  ChoreographyPreparationTrace,
  NodeHandleRef,
  ChoreographyNavigationLineage,
  RegisteredElement,
  TransitionSessionData,
} from '../types';
import { ElementRegistry } from '../core/ElementRegistry';
import { ElementVisibilityRegistry } from '../core/ElementVisibilityRegistry';
import { ChoreographyProgressProvider } from '../core/ChoreographyProgressContext';
import { NativeTransitionHost } from '../native/NativeTransitionHost';
import { hostsReportAttachment } from '../native/attachmentCapability';
import { TransitionCoordinator } from '../core/TransitionCoordinator';
import { hasFabricLayoutCapture } from '../core/fabricLayout';
import { TransitionOverlay } from '../core/TransitionOverlay';
import {
  ChoreographyContext,
  ChoreographyActionsContext,
  PreparingSessionContext,
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
import { useReverseTransitionCommit } from '../hooks/useReverseTransitionCommit';
import { scheduleOnUI } from 'react-native-worklets';
import { TRANSITION_LAYER_Z_INDEX } from '../core/layers';
import {
  PRESENTATION_TIMEOUT_MS,
  type PresentationFailureDetails,
  type PresentationFailureReason,
} from '../core/nativePresentation';

function TransitionHostPortal({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  if (Platform.OS === 'ios') {
    return <>{children}</>;
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
  /** Optional deferred startup diagnostics; does not run inside preparation. */
  onPreparationTrace?: (trace: ChoreographyPreparationTrace) => void;
}

interface OverlayWaiter {
  resolve: (ready: boolean) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  onUnavailable?: (details: PresentationFailureDetails) => void;
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
  onPreparationTrace,
}: ChoreographyProviderProps) {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const progressOwner = useSharedValue(0);
  const interactionOwner = useSharedValue<string | null>(null);
  const [interactiveScreenId, setInteractiveScreenId] = useState<string | null>(
    null
  );
  const setInteractiveScreen = useCallback(
    (screenId: string, active: boolean) => {
      setInteractiveScreenId((current) =>
        active ? screenId : current === screenId ? null : current
      );
    },
    []
  );
  const [visibilityRegistry] = useState(() => new ElementVisibilityRegistry());
  const [progressOwnership] = useState(
    () =>
      new ProgressOwnership(
        progressOwner,
        progress,
        visibilityRegistry.handoff,
        reducedMotion
      )
  );
  const [navigationController] = useState(
    () => new NavigationSessionController()
  );
  const [activeSession, setActiveSession] =
    useState<TransitionSessionData | null>(null);
  const [overlaySession, setOverlaySession] =
    useState<TransitionSessionData | null>(null);
  const [pendingTargetScreenId, setPendingTargetScreenId] = useState<
    string | null
  >(null);
  const [pendingSourceScreenId, setPendingSourceScreenId] = useState<
    string | null
  >(null);
  // Preparing mounts empty overlay hosts so native can attach them first.
  const isOverlayActive =
    (overlaySession?.state === 'active' ||
      overlaySession?.state === 'preparing') &&
    overlaySession.pairs.length > 0 &&
    !overlaySession.reducedMotion;
  const preparingSession =
    overlaySession?.state === 'preparing' ? overlaySession : null;
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
    const session = activeSessionRef.current;
    visibilityRegistry.sync(
      hidden,
      session?.state === 'active' ? session.id : null
    );
  }, [visibilityRegistry]);
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
        syncHiddenElements();
        settleOverlayWaiters(sessionId, true);
      }
    },
    [settleOverlayWaiters, syncHiddenElements]
  );
  const screenReadinessRef = useRef(new ScreenReadinessRegistry());
  const screenNamesRef = useRef(new Map<string, string>());
  const nativeScreenRefs = useRef(new Map<string, NodeHandleRef>());
  // Unlike presentation refs, membership survives presentation re-registration.
  const mountedScreensRef = useRef(new Set<string>());
  const screenRemovalListenersRef = useRef(new Map<string, Set<() => void>>());

  const registryRef = useRef<ElementRegistry | null>(null);
  const coordinatorRef = useRef<TransitionCoordinator | null>(null);

  if (!registryRef.current) {
    registryRef.current = new ElementRegistry();
  }
  if (!coordinatorRef.current) {
    // Install before descendants commit: lazy native-module loading on the
    // first transition misses the source mount and waits for the capture timeout.
    hasFabricLayoutCapture();
    coordinatorRef.current = new TransitionCoordinator(
      registryRef.current,
      progress,
      {
        getScreenRef: (screenId) => nativeScreenRefs.current.get(screenId),
        isScreenReady: (screenId) =>
          screenReadinessRef.current.isReady(screenId),
        waitsForAttachment: hostsReportAttachment,
      }
    );
  }

  useLayoutEffect(() => {
    const coordinator = coordinatorRef.current!;
    const screenReadiness = screenReadinessRef.current;
    const screenNames = screenNamesRef.current;
    const hiddenMap = visibilityRegistry;
    const navigationLineage = navigationLineageRef.current;
    coordinator.setOnSessionChange((session) => {
      navigationController.setActiveSession(session);
      progressOwnership.setSession(session?.id ?? null);
      if (session && activeSessionRef.current?.id !== session.id) {
        scheduleOnUI(() => {
          'worklet';
          interactionOwner.value = null;
        });
      }
      const previousSession = activeSessionRef.current;
      activeSessionRef.current = session;
      setOverlaySession(session);
      // Screens treat preparing like measuring; skip an app-wide render.
      if (session?.state !== 'preparing') setActiveSession(session);
      if (previousSession && previousSession.id !== session?.id) {
        settleOverlayWaiters(previousSession.id, false);
      }
      // Fabric mount notifications can update geometry within the same
      // session. Its host and overlay stay mounted and do not acknowledge
      // again, so retain their readiness until the session identity changes.
      if (previousSession?.id !== session?.id) {
        hostPresentedSessionIdRef.current = null;
        overlayContentReadySessionIdRef.current = null;
      }

      if (!session) {
        setInteractiveScreenId(null);
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
    visibilityRegistry,
    interactionOwner,
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
    coordinatorRef.current?.revalidatePresentation();
  }, []);

  const unregisterElement = useCallback(
    (id: string, screenId: string, groupId: string | undefined) => {
      registryRef.current!.unregister(id, screenId, groupId);
      coordinatorRef.current?.revalidatePresentation();
      const key = getElementIdentityKey(screenId, groupId, id);
      if (coordinatorRef.current?.getHiddenElements().has(key)) {
        return;
      }
      visibilityRegistry.delete(key);
    },
    [visibilityRegistry]
  );

  const setScreenReady = useCallback(
    (screenId: string, ready: boolean, screenName?: string) => {
      if (screenName) screenNamesRef.current.set(screenId, screenName);
      screenReadinessRef.current.setReady(screenId, ready);
      coordinatorRef.current?.revalidatePresentation();

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
      coordinatorRef.current?.revalidatePresentation(screenId);
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
      mountedScreensRef.current.delete(screenId);
      const removalListeners = screenRemovalListenersRef.current.get(screenId);
      if (removalListeners) {
        screenRemovalListenersRef.current.delete(screenId);
        [...removalListeners].forEach((listener) => listener());
      }
    },
    [navigationController, progressOwnership]
  );

  const subscribeToScreenRemoval = useCallback(
    (screenId: string, listener: () => void) => {
      if (!mountedScreensRef.current.has(screenId)) {
        listener();
        return () => {};
      }
      const listeners = screenRemovalListenersRef.current;
      let screenListeners = listeners.get(screenId);
      if (!screenListeners) {
        screenListeners = new Set();
        listeners.set(screenId, screenListeners);
      }
      screenListeners.add(listener);
      return () => {
        const current = listeners.get(screenId);
        current?.delete(listener);
        if (current?.size === 0) listeners.delete(screenId);
      };
    },
    []
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
    coordinatorRef.current?.revalidatePresentation();
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

  const getSettledScreenId = useCallback(() => {
    const settledScreenId = coordinatorRef.current?.getSettledScreenId();
    return settledScreenId && mountedScreensRef.current.has(settledScreenId)
      ? settledScreenId
      : null;
  }, []);

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
      return visibilityRegistry.get(
        key,
        coordinatorRef.current?.getHiddenElements().has(key) ?? false
      );
    },
    [visibilityRegistry]
  );

  const startTransition = useCallback(
    async (config: {
      groupId: string;
      sourceScreenId: string;
      targetScreenId: string;
      direction: 'forward' | 'backward';
      onUnavailable?: (sessionId: string) => void;
      trace?: PreparationTrace;
    }) => {
      return coordinatorRef.current!.startTransition({
        ...config,
        reducedMotion,
      });
    },
    [reducedMotion]
  );

  const captureSourceGroup = useCallback(
    async (groupId: string, screenId: string) => {
      await coordinatorRef.current!.captureSourceGroup(groupId, screenId);
    },
    []
  );

  const refreshActiveSessionMetrics = useCallback(
    async (side: 'source' | 'target') => {
      await coordinatorRef.current!.refreshActiveSessionMetrics(side);
    },
    []
  );

  const isOverlayPresented = useCallback(
    (sessionId: string) =>
      hostPresentedSessionIdRef.current === sessionId &&
      overlayContentReadySessionIdRef.current === sessionId,
    []
  );

  const handlePresentationFailed = useCallback(
    (sessionId: string, reason: PresentationFailureReason) => {
      const session = activeSessionRef.current;
      // Record unconfirmed presentation before settlement invalidates the
      // session and resolves its waiters as cancelled.
      if (session?.id === sessionId) {
        overlayWaitersRef.current.get(sessionId)?.forEach((waiter) => {
          const phase = session.presentation?.phase.value;
          waiter.onUnavailable?.({
            reason,
            phase:
              phase === 2
                ? 'presented'
                : phase === 1
                  ? 'transferring'
                  : phase === -1
                    ? 'attaching'
                    : 'mounting',
            contentReady: overlayContentReadySessionIdRef.current === sessionId,
            hostAcknowledged: hostPresentedSessionIdRef.current === sessionId,
          });
        });
      }
      if (
        session?.id === sessionId &&
        session.direction === 'backward' &&
        overlayWaitersRef.current.has(sessionId)
      ) {
        // The waiting Back/gesture controller owns fallback navigation and
        // settlement. Revoke late attachment without canceling that ownership.
        if (session.presentation) session.presentation.valid.value = false;
      } else {
        coordinatorRef.current!.failPresentation(sessionId);
      }
      settleOverlayWaiters(sessionId, false);
    },
    [settleOverlayWaiters]
  );

  const waitForOverlayReady = useCallback(
    async (
      sessionId: string,
      onUnavailable?: (details: PresentationFailureDetails) => void
    ) => {
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

        const timeoutId = setTimeout(() => {
          const session = activeSessionRef.current;
          if (session?.id !== sessionId) {
            settleOverlayWaiters(sessionId, false);
            return;
          }
          if (
            overlayContentReadySessionIdRef.current !== sessionId ||
            !session.presentation?.valid.value ||
            session.presentation?.phase.value !== 2
          ) {
            handlePresentationFailed(sessionId, 'timeout');
            return;
          }
          // The UI thread already accepted native presentation; only its RN
          // callback was delayed. Preserve that proof in the readiness trace.
          hostPresentedSessionIdRef.current = sessionId;
          resolveOverlayWaitersIfReady(sessionId);
        }, PRESENTATION_TIMEOUT_MS);

        const waiter: OverlayWaiter = { resolve, timeoutId, onUnavailable };
        waiters.add(waiter);
        resolveOverlayWaitersIfReady(sessionId);
      });
    },
    [
      handlePresentationFailed,
      resolveOverlayWaitersIfReady,
      settleOverlayWaiters,
    ]
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

  const getActiveSession = useCallback(() => activeSessionRef.current, []);
  const {
    reverseController,
    reverseHandoff,
    interruptibleReturnSessionId,
    commitReverseTransition,
    registerScreenPresentation: registerReverseScreenPresentation,
  } = useReverseTransitionCommit({
    progress,
    progressOwnership,
    navigationController,
    interactionOwner,
    getSession: getActiveSession,
    completeTransition,
    cancelTransition,
  });

  const registerScreenPresentation = useCallback<
    ChoreographyActionsType['registerScreenPresentation']
  >(
    (screenId, ref, animationLifetime) => {
      nativeScreenRefs.current.set(screenId, ref);
      mountedScreensRef.current.add(screenId);
      const release = registerReverseScreenPresentation(
        screenId,
        ref,
        animationLifetime
      );
      return () => {
        if (nativeScreenRefs.current.get(screenId) === ref)
          nativeScreenRefs.current.delete(screenId);
        release();
      };
    },
    [registerReverseScreenPresentation]
  );

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
      if (!session || session.id !== sessionId) return;
      if (session.state === 'active' && session.pairs.length > 0) {
        overlayContentReadySessionIdRef.current = sessionId;
        // Reduced-motion content commits directly to its endpoint host. There
        // is no native overlay presentation to wait for in this path.
        if (session.reducedMotion)
          hostPresentedSessionIdRef.current = sessionId;
        resolveOverlayWaitersIfReady(sessionId);
      }
    },
    [resolveOverlayWaitersIfReady]
  );

  const handleHostAttached = useCallback((sessionId: string) => {
    coordinatorRef.current?.acknowledgeAttachment(sessionId);
  }, []);

  const handleHostPresentationReady = useCallback(
    (sessionId: string) => {
      const session = activeSessionRef.current;
      if (
        !session ||
        session.id !== sessionId ||
        session.state !== 'active' ||
        session.pairs.length === 0
      ) {
        return;
      }

      hostPresentedSessionIdRef.current = session.id;
      if (session.presentationTiming)
        session.presentationTiming.acknowledgedAtMs ??=
          globalThis.performance.now();
      resolveOverlayWaitersIfReady(session.id);
    },
    [resolveOverlayWaitersIfReady]
  );

  const settleTransition = useCallback(
    (screenId: string) => {
      const session = activeSessionRef.current;
      const role = getScreenRole(session, screenId);
      if (!session || role === 'inactive') return;
      const expanded =
        session.direction === 'forward' ? role === 'target' : role === 'source';
      if (reverseController.owns(session.id)) {
        // Scrolling the returning screen must move the real element, not leave
        // its overlay at the frozen destination. Wait for confirmed removal.
        if (!expanded) reverseController.finishImmediately(session.id);
        return;
      }
      const sessionId = session.id;
      const token = progressOwnership.claim(sessionId);
      if (token === null) return;
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
    [
      cancelTransition,
      completeTransition,
      progress,
      progressOwnership,
      reverseController,
    ]
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
      subscribeToScreenRemoval,
      waitForScreenReady,
      registerScreenPresentation,
    }),
    [
      registerElement,
      unregisterElement,
      isElementHidden,
      setScreenReady,
      unregisterScreen,
      acquireScreenBlocker,
      getSettledScreenId,
      subscribeToScreenRemoval,
      waitForScreenReady,
      registerScreenPresentation,
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
      reverseController,
      reverseHandoff,
      interruptibleReturnSessionId,
      commitReverseTransition,
      interactionOwner,
      interactiveScreenId,
      setInteractiveScreen,
      captureSourceGroup,
      refreshActiveSessionMetrics,
      waitForOverlayReady,
      isOverlayPresented,
      startTransition,
      completeTransition,
      cancelTransition,
      onPreparationTrace,
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
      reverseController,
      reverseHandoff,
      interruptibleReturnSessionId,
      commitReverseTransition,
      interactionOwner,
      interactiveScreenId,
      setInteractiveScreen,
      captureSourceGroup,
      refreshActiveSessionMetrics,
      waitForOverlayReady,
      isOverlayPresented,
      startTransition,
      completeTransition,
      cancelTransition,
      onPreparationTrace,
      debug,
    ]
  );

  return (
    <PortalProvider>
      <ChoreographyActionsContext.Provider value={actionsValue}>
        <ChoreographyControlsContext.Provider value={controlsValue}>
          <ChoreographyContext.Provider value={contextValue}>
            <PreparingSessionContext.Provider value={preparingSession}>
              <ChoreographyProgressProvider>
                {children}
                <TransitionHostPortal
                  active={Boolean(isOverlayActive && overlaySession)}
                >
                  <NativeTransitionHost
                    returnTargetScreenId={
                      overlaySession?.direction === 'backward'
                        ? overlaySession.targetScreenId
                        : undefined
                    }
                    reverseHandoff={reverseHandoff}
                    gestureEngaged={interactiveScreenId != null}
                    ownership={progressOwnership}
                    progress={progress}
                    sessionId={overlaySession?.id}
                    presentation={overlaySession?.presentation}
                    onPresentationFailed={handlePresentationFailed}
                    active={Boolean(isOverlayActive && overlaySession)}
                    onPresentationReady={handleHostPresentationReady}
                    onAttached={handleHostAttached}
                  >
                    <TransitionOverlay
                      session={overlaySession}
                      progress={progress}
                      onReady={handleOverlayReady}
                    />
                  </NativeTransitionHost>
                </TransitionHostPortal>
              </ChoreographyProgressProvider>
            </PreparingSessionContext.Provider>
          </ChoreographyContext.Provider>
        </ChoreographyControlsContext.Provider>
      </ChoreographyActionsContext.Provider>
    </PortalProvider>
  );
}

const styles = StyleSheet.create({
  androidPortal: {
    ...StyleSheet.absoluteFill,
    zIndex: TRANSITION_LAYER_Z_INDEX,
  },
});

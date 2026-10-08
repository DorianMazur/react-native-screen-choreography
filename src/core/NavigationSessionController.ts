import type {
  ChoreographyNavigateOptions,
  TransitionSessionData,
} from '../types';
import type { PreparationTrace } from './preparationTrace';
import type { PresentationFailureDetails } from './nativePresentation';
import { NavigationRequestObserver } from './NavigationRequestObserver';

export interface PendingNavigationRequest {
  targetScreenId: string;
  sourceScreenId?: string;
  dispatchNavigation: () => void;
  resolveTargetScreenId?: () => Promise<string | null>;
  options?: ChoreographyNavigateOptions;
  observer?: NavigationRequestObserver;
}

interface PrepareForwardTransitionArgs {
  observer?: NavigationRequestObserver;
  groupId: string;
  sourceScreenId: string;
  targetScreenId: string;
  isAndroid: boolean;
  trace?: PreparationTrace;
  captureSourceGroup: (groupId: string, screenId: string) => Promise<void>;
  setPendingTargetScreen: (
    screenId: string | null,
    sourceScreenId?: string
  ) => void;
  dispatchNavigation: () => void;
  resolveTargetScreenId?: () => Promise<string | null>;
  waitForScreenReady: (screenId: string) => Promise<boolean>;
  waitForNextFrame: () => Promise<void>;
  startTransition: (config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward';
    trace?: PreparationTrace;
    onUnavailable?: (sessionId: string) => void;
  }) => Promise<TransitionSessionData | null>;
  waitForOverlayReady: (
    sessionId: string,
    onUnavailable?: (details: PresentationFailureDetails) => void
  ) => Promise<boolean>;
  onSessionPrepared?: (session: TransitionSessionData) => void;
  isOverlayPresented?: (sessionId: string) => boolean;
  isPreparationCurrent?: () => boolean;
  isSessionCurrent?: (sessionId: string) => boolean;
}

/**
 * Mutable navigation-session state kept outside React so rapid callbacks can
 * make atomic lock, queue, and stale-animation decisions.
 */
export class NavigationSessionController {
  private navigationLocked = false;
  private navigationLockToken = 0;
  private navigationSourceScreenId: string | null = null;
  private pendingRequest: PendingNavigationRequest | null = null;
  private animationToken = 0;
  private activeSession: TransitionSessionData | null = null;
  private requests = new Set<NavigationRequestObserver>();

  setActiveSession(
    session: TransitionSessionData | null,
    settledScreenId?: string | null,
    presented = true
  ): void {
    const previous = this.activeSession;
    this.activeSession = session;
    if (!previous || previous.id === session?.id) return;
    for (const request of [...this.requests]) {
      if (request.sessionId !== previous.id) continue;
      if (!session && settledScreenId === request.targetScreenId) {
        request.emit(
          previous.reducedMotion
            ? { status: 'fallback', finished: true, reason: 'reduced-motion' }
            : !presented
              ? {
                  status: 'fallback',
                  finished: true,
                  reason: 'overlay-unavailable',
                }
              : { status: 'completed', finished: true }
        );
      } else {
        request.emit({
          status: 'cancelled',
          finished: true,
          reason: 'interrupted',
        });
      }
    }
  }

  observeNavigation(
    sourceScreenId: string,
    targetScreenId: string,
    listener: ChoreographyNavigateOptions['onNavigationEvent']
  ): NavigationRequestObserver | undefined {
    if (!listener) return undefined;
    const observer = new NavigationRequestObserver(
      sourceScreenId,
      targetScreenId,
      listener,
      () => this.requests.delete(observer)
    );
    this.requests.add(observer);
    return observer;
  }

  cancelRequestsForScreen(screenId: string): void {
    for (const request of [...this.requests]) {
      if (request.sourceScreenId === screenId && request.sessionId === null) {
        request.emit({
          status: 'cancelled',
          finished: true,
          reason: 'source-removed',
        });
      }
    }
  }

  disposeRequests(): void {
    this.pendingRequest = null;
    for (const request of [...this.requests]) {
      request.emit({
        status: 'cancelled',
        finished: true,
        reason: 'provider-unmounted',
      });
    }
  }

  getActiveSession(): TransitionSessionData | null {
    return this.activeSession;
  }

  acquireNavigationLock(sourceScreenId?: string): boolean {
    if (this.navigationLocked) {
      return false;
    }
    this.navigationLocked = true;
    this.navigationLockToken += 1;
    this.navigationSourceScreenId = sourceScreenId ?? null;
    return true;
  }

  releaseNavigationLock(token?: number): void {
    if (token !== undefined && token !== this.navigationLockToken) return;
    this.navigationLocked = false;
    this.navigationSourceScreenId = null;
  }

  getNavigationLockToken(): number {
    return this.navigationLockToken;
  }

  getNavigationSourceScreenId(): string | null {
    return this.navigationSourceScreenId;
  }

  isNavigationLocked(): boolean {
    return this.navigationLocked;
  }

  queueNavigation(request: PendingNavigationRequest): void {
    const previous = this.pendingRequest;
    this.pendingRequest = request;
    if (previous?.observer !== request.observer) {
      previous?.observer?.emit({
        status: 'superseded',
        finished: true,
        reason: 'newer-request',
      });
    }
    request.observer?.emit({ status: 'queued', finished: false });
  }

  peekQueuedNavigation(): PendingNavigationRequest | null {
    return this.pendingRequest;
  }

  takeQueuedNavigation(): PendingNavigationRequest | null {
    const request = this.pendingRequest;
    this.pendingRequest = null;
    return request;
  }

  clearQueuedNavigation(
    reason: 'queue-cleared' | 'newer-request' = 'queue-cleared'
  ): void {
    const previous = this.pendingRequest;
    this.pendingRequest = null;
    previous?.observer?.emit(
      reason === 'newer-request'
        ? { status: 'superseded', finished: true, reason }
        : { status: 'cancelled', finished: true, reason }
    );
  }

  createAnimationToken(): number {
    this.animationToken += 1;
    return this.animationToken;
  }

  invalidateAnimation(): void {
    this.animationToken += 1;
  }

  isCurrentAnimation(token: number): boolean {
    return this.animationToken === token;
  }

  isCurrentSession(sessionId: string): boolean {
    return this.activeSession?.id === sessionId;
  }

  async prepareForwardTransition({
    observer,
    groupId,
    sourceScreenId,
    targetScreenId,
    isAndroid,
    trace,
    captureSourceGroup,
    setPendingTargetScreen,
    dispatchNavigation,
    resolveTargetScreenId,
    waitForScreenReady,
    waitForNextFrame,
    startTransition,
    waitForOverlayReady,
    onSessionPrepared,
    isOverlayPresented = () => true,
    isPreparationCurrent = () => true,
    isSessionCurrent = () => true,
  }: PrepareForwardTransitionArgs): Promise<TransitionSessionData | null> {
    let outcome: Parameters<PreparationTrace['finish']>[0] = 'cancelled';
    let fallbackReason:
      | 'screen-not-ready'
      | 'transition-unavailable'
      | 'overlay-unavailable' = 'transition-unavailable';
    let targetUnavailable = false;
    try {
      const sourceMeasured = trace?.start('source-capture');
      await captureSourceGroup(groupId, sourceScreenId);
      sourceMeasured?.();
      if (!isPreparationCurrent()) return null;
      setPendingTargetScreen(targetScreenId, sourceScreenId);
      const instanceResolved = trace?.start('navigation-instance');
      dispatchNavigation();

      const targetInstanceId = resolveTargetScreenId
        ? await resolveTargetScreenId()
        : targetScreenId;
      instanceResolved?.();
      if (!isPreparationCurrent()) return null;
      if (!targetInstanceId) {
        targetUnavailable = true;
        outcome = 'unavailable';
        this.releaseNavigationLock();
        setPendingTargetScreen(null);
        return null;
      }
      if (observer) observer.targetScreenId = targetInstanceId;
      if (targetInstanceId !== targetScreenId) {
        setPendingTargetScreen(targetInstanceId, sourceScreenId);
      }
      const screenBecameReady = trace?.start('screen-ready');
      const screenReady = await waitForScreenReady(targetInstanceId);
      screenBecameReady?.({ ready: screenReady });
      if (!isPreparationCurrent()) return null;
      if (!screenReady) {
        fallbackReason = 'screen-not-ready';
        outcome = 'unavailable';
        this.releaseNavigationLock();
        setPendingTargetScreen(null);
        return null;
      }

      if (isAndroid) {
        const framePassed = trace?.start('android-frame');
        await waitForNextFrame();
        framePassed?.();
        if (!isPreparationCurrent()) return null;
      }

      const coordinatorReady = trace?.start('coordinator');
      const session = await startTransition({
        groupId,
        sourceScreenId,
        targetScreenId: targetInstanceId,
        direction: 'forward',
        ...(trace ? { trace } : {}),
        ...(observer
          ? {
              onUnavailable: () =>
                observer.emit({
                  status: 'fallback',
                  finished: true,
                  reason: 'transition-unavailable',
                }),
            }
          : {}),
      });
      coordinatorReady?.();

      if (!session) {
        if (!isPreparationCurrent()) return null;
        outcome = 'unavailable';
        this.releaseNavigationLock();
        setPendingTargetScreen(null);
        return null;
      }

      trace?.setSession(session.id, targetInstanceId);
      if (observer) observer.sessionId = session.id;
      onSessionPrepared?.(session);
      const endOverlay = trace?.start('overlay-ready');
      const overlayReady = await waitForOverlayReady(
        session.id,
        trace
          ? (details) => {
              endOverlay?.({ ...details, ready: false, acknowledged: false });
              trace.finish('overlay-timeout');
            }
          : undefined
      );
      const acknowledged = trace
        ? overlayReady && isOverlayPresented(session.id)
        : overlayReady;
      endOverlay?.({ ready: overlayReady, acknowledged });
      if (!isSessionCurrent(session.id)) return null;
      if (!overlayReady) {
        fallbackReason = 'overlay-unavailable';
        outcome = 'unavailable';
        this.releaseNavigationLock();
        setPendingTargetScreen(null);
        return null;
      }
      setPendingTargetScreen(null);
      outcome = acknowledged ? 'overlay-ready' : 'overlay-timeout';
      return session;
    } catch (error) {
      if (!isPreparationCurrent()) return null;
      observer?.emit({ status: 'failed', finished: true, error });
      outcome = 'failed';
      this.releaseNavigationLock();
      setPendingTargetScreen(null);
      throw error;
    } finally {
      trace?.finish(outcome);
      if (outcome === 'cancelled') {
        observer?.emit({
          status: 'cancelled',
          finished: true,
          reason: 'interrupted',
        });
      } else if (outcome === 'unavailable') {
        observer?.emit(
          targetUnavailable
            ? {
                status: 'cancelled',
                finished: true,
                reason: 'target-unavailable',
              }
            : { status: 'fallback', finished: true, reason: fallbackReason }
        );
      }
    }
  }
}

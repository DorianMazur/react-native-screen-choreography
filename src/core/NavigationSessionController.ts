import type {
  ChoreographyNavigationOptions,
  TransitionSessionData,
} from '../types';
import type { PreparationTrace } from './preparationTrace';

export interface PendingNavigationRequest {
  targetScreenId: string;
  sourceScreenId?: string;
  dispatchNavigation: () => void;
  resolveTargetScreenId?: () => Promise<string | null>;
  options?: ChoreographyNavigationOptions;
}

interface PrepareForwardTransitionArgs {
  groupId: string;
  sourceScreenId: string;
  targetScreenId: string;
  isAndroid: boolean;
  trace?: PreparationTrace;
  preMeasureGroup: (groupId: string, screenId: string) => Promise<void>;
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
  }) => Promise<TransitionSessionData | null>;
  waitForOverlayReady: (sessionId: string) => Promise<boolean>;
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

  setActiveSession(session: TransitionSessionData | null): void {
    this.activeSession = session;
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
    this.pendingRequest = request;
  }

  peekQueuedNavigation(): PendingNavigationRequest | null {
    return this.pendingRequest;
  }

  takeQueuedNavigation(): PendingNavigationRequest | null {
    const request = this.pendingRequest;
    this.pendingRequest = null;
    return request;
  }

  clearQueuedNavigation(): void {
    this.pendingRequest = null;
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
    groupId,
    sourceScreenId,
    targetScreenId,
    isAndroid,
    trace,
    preMeasureGroup,
    setPendingTargetScreen,
    dispatchNavigation,
    resolveTargetScreenId,
    waitForScreenReady,
    waitForNextFrame,
    startTransition,
    waitForOverlayReady,
    isOverlayPresented = () => true,
    isPreparationCurrent = () => true,
    isSessionCurrent = () => true,
  }: PrepareForwardTransitionArgs): Promise<TransitionSessionData | null> {
    let outcome: Parameters<PreparationTrace['finish']>[0] = 'cancelled';
    try {
      const sourceMeasured = trace?.start('source-measure');
      await preMeasureGroup(groupId, sourceScreenId);
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
        outcome = 'unavailable';
        this.releaseNavigationLock();
        setPendingTargetScreen(null);
        return null;
      }
      if (targetInstanceId !== targetScreenId) {
        setPendingTargetScreen(targetInstanceId, sourceScreenId);
      }
      const screenBecameReady = trace?.start('screen-ready');
      const screenReady = await waitForScreenReady(targetInstanceId);
      screenBecameReady?.({ ready: screenReady });
      if (!isPreparationCurrent()) return null;
      if (!screenReady) {
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
      const endOverlay = trace?.start('overlay-ready');
      const overlayReady = await waitForOverlayReady(session.id);
      const acknowledged = trace
        ? overlayReady && isOverlayPresented(session.id)
        : overlayReady;
      endOverlay?.({ ready: overlayReady, acknowledged });
      if (!isSessionCurrent(session.id)) return null;
      if (!overlayReady) {
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
      outcome = 'failed';
      this.releaseNavigationLock();
      setPendingTargetScreen(null);
      throw error;
    } finally {
      trace?.finish(outcome);
    }
  }
}

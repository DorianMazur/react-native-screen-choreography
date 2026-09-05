import type {
  ChoreographyNavigationOptions,
  TransitionSessionData,
} from '../types';

export interface PendingNavigationRequest {
  targetScreenId: string;
  dispatchNavigation: () => void;
  options?: ChoreographyNavigationOptions;
}

interface PrepareForwardTransitionArgs {
  groupId: string;
  sourceScreenId: string;
  targetScreenId: string;
  isAndroid: boolean;
  preMeasureGroup: (groupId: string, screenId: string) => Promise<void>;
  setPendingTargetScreen: (screenId: string | null) => void;
  dispatchNavigation: () => void;
  waitForScreenReady: (screenId: string) => Promise<boolean>;
  waitForNextFrame: () => Promise<void>;
  startTransition: (config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward';
  }) => Promise<TransitionSessionData | null>;
  waitForOverlayReady: (sessionId: string) => Promise<boolean>;
  isPreparationCurrent?: () => boolean;
  isSessionCurrent?: (sessionId: string) => boolean;
}

/**
 * Mutable navigation-session state kept outside React so rapid callbacks can
 * make atomic lock, queue, and stale-animation decisions.
 */
export class NavigationSessionController {
  private navigationLocked = false;
  private pendingRequest: PendingNavigationRequest | null = null;
  private animationToken = 0;
  private activeSession: TransitionSessionData | null = null;

  setActiveSession(session: TransitionSessionData | null): void {
    this.activeSession = session;
  }

  getActiveSession(): TransitionSessionData | null {
    return this.activeSession;
  }

  acquireNavigationLock(): boolean {
    if (this.navigationLocked) {
      return false;
    }
    this.navigationLocked = true;
    return true;
  }

  releaseNavigationLock(): void {
    this.navigationLocked = false;
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
    preMeasureGroup,
    setPendingTargetScreen,
    dispatchNavigation,
    waitForScreenReady,
    waitForNextFrame,
    startTransition,
    waitForOverlayReady,
    isPreparationCurrent = () => true,
    isSessionCurrent = () => true,
  }: PrepareForwardTransitionArgs): Promise<TransitionSessionData | null> {
    try {
      await preMeasureGroup(groupId, sourceScreenId);
      if (!isPreparationCurrent()) return null;
      setPendingTargetScreen(targetScreenId);
      dispatchNavigation();

      const screenReady = await waitForScreenReady(targetScreenId);
      if (!isPreparationCurrent()) return null;
      if (!screenReady) {
        this.releaseNavigationLock();
        setPendingTargetScreen(null);
        return null;
      }

      if (isAndroid) {
        await waitForNextFrame();
        if (!isPreparationCurrent()) return null;
      }

      const session = await startTransition({
        groupId,
        sourceScreenId,
        targetScreenId,
        direction: 'forward',
      });

      if (!session) {
        if (!isPreparationCurrent()) return null;
        this.releaseNavigationLock();
        setPendingTargetScreen(null);
        return null;
      }

      const overlayReady = await waitForOverlayReady(session.id);
      if (!isSessionCurrent(session.id)) return null;
      if (!overlayReady) {
        this.releaseNavigationLock();
        setPendingTargetScreen(null);
        return null;
      }
      setPendingTargetScreen(null);
      return session;
    } catch (error) {
      if (!isPreparationCurrent()) return null;
      this.releaseNavigationLock();
      setPendingTargetScreen(null);
      throw error;
    }
  }
}

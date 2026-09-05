import { animateOwnedProgress } from './ProgressOwnership';
import type { ChoreographyContextType } from './ChoreographyContext';
import { FAST_SPRING } from './constants';
import type { SpringConfig } from '../types';
import { debugLog } from '../debug/logger';

export interface RunReverseTransitionArgs {
  ctx: ChoreographyContextType;
  /** Shared element group ID from provider lineage or legacy route params. */
  groupId: string;
  /** Screen we are returning TO (the original forward source). */
  sourceScreenId: string;
  /** Screen we are leaving (the original forward target). */
  currentScreenId: string;
  /** Pop the route. Always invoked, even on failure, so the user is not stuck. */
  popAction: () => void;
  isRouteRemoved?: () => boolean;
  canContinue?: () => boolean;
  /** Spring config. Defaults to {@link FAST_SPRING}. */
  spring?: SpringConfig;
}

export async function runReverseTransition(
  args: RunReverseTransitionArgs
): Promise<void> {
  const {
    ctx,
    groupId,
    sourceScreenId,
    currentScreenId,
    popAction,
    isRouteRemoved,
    canContinue = () => true,
    spring = FAST_SPRING,
  } = args;
  const {
    progress,
    progressOwnership,
    preMeasureGroup,
    startTransition,
    completeTransition,
    cancelTransition,
    waitForOverlayReady,
  } = ctx;
  let reverseSessionId: string | null = null;
  const preparationVersion = progressOwnership.version;
  let animationToken: number | null = null;
  let navigationCommitted = false;
  const commitNavigation = () => {
    if (
      navigationCommitted ||
      !canContinue() ||
      (reverseSessionId
        ? !progressOwnership.isSession(reverseSessionId)
        : progressOwnership.version !== preparationVersion)
    ) {
      return;
    }
    navigationCommitted = true;
    popAction();
  };

  try {
    debugLog('[BackIntercept] preMeasureGroup start');
    await preMeasureGroup(groupId, currentScreenId);
    if (!canContinue() || progressOwnership.version !== preparationVersion)
      return;
    debugLog('[BackIntercept] preMeasureGroup done');

    const reverseSession = await startTransition({
      groupId,
      sourceScreenId: currentScreenId,
      targetScreenId: sourceScreenId,
      direction: 'backward',
    });
    debugLog(
      `[BackIntercept] startTransition returned session=${reverseSession?.id ?? 'null'}`
    );

    if (!reverseSession) {
      debugLog(
        '[BackIntercept] reverse session creation failed; falling back to plain pop'
      );
      commitNavigation();
      return;
    }
    reverseSessionId = reverseSession.id;
    animationToken = progressOwnership.claim(reverseSessionId);
    if (animationToken === null) return;

    // Wait for the overlay to actually paint and the native host to ack the
    // presentation BEFORE we pop the route. Without this:
    //   * overlay → handleOverlayReady → syncHiddenElements never runs in
    //     time, so the real source/target elements stay visible alongside
    //     the overlay,
    //   * popping the route unmounts the source screen during the gap and
    //     the user just sees the destination snap into place.
    // The provider has a 150ms safety net for slow Android frames.
    const overlayReady = await waitForOverlayReady(reverseSession.id);
    if (!progressOwnership.isCurrent(animationToken, reverseSession.id)) return;
    if (!overlayReady || !canContinue()) {
      cancelTransition(reverseSession.id);
      return;
    }
    debugLog('[BackIntercept] overlay ready, calling popAction');
    commitNavigation();
    if (isRouteRemoved) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      if (!progressOwnership.isCurrent(animationToken, reverseSession.id))
        return;
      if (!isRouteRemoved()) {
        cancelTransition(reverseSession.id);
        return;
      }
    }
    debugLog('[BackIntercept] popAction returned, scheduling spring');

    const sessionId = reverseSession.id;
    animateOwnedProgress({
      ownership: progressOwnership,
      token: animationToken,
      sessionId,
      progress,
      target: 0,
      spring,
      onComplete: (token, completedSessionId) => {
        if (progressOwnership.isCurrent(token, completedSessionId)) {
          completeTransition(completedSessionId);
        }
      },
    });
  } catch (error) {
    debugLog(
      `[BackIntercept] reverse transition error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    if (
      reverseSessionId &&
      (animationToken === null ||
        progressOwnership.isCurrent(animationToken, reverseSessionId))
    ) {
      commitNavigation();
      cancelTransition(reverseSessionId);
      return;
    }
    commitNavigation();
  }
}

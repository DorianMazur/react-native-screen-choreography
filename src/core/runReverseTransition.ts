import type {
  CommitBackNavigation,
  NavigationCommitResult,
} from './navigationCommit';
import type { ChoreographyContextType } from './ChoreographyContext';
import { PreparationTrace } from './preparationTrace';
import { setOwnedProgress } from './ProgressOwnership';
import { FAST_SPRING } from './constants';
import type {
  InteractiveTransitionSettleOptions,
  SpringConfig,
  TransitionSessionData,
} from '../types';
import { debugLog } from '../debug/logger';

/** Reverse the current animation for either application or Android Back. */
export function reverseActiveSession({
  ctx,
  session,
  navigateBack,
  options,
  canContinue = () => true,
}: {
  ctx: ChoreographyContextType;
  session: TransitionSessionData;
  navigateBack: CommitBackNavigation;
  options?: InteractiveTransitionSettleOptions;
  canContinue?: () => boolean;
}): { token: number; completion: Promise<void> } | null {
  const { progressOwnership, progress, navigationController } = ctx;
  if (!canContinue()) return null;
  const token = progressOwnership.claim(session.id);
  if (token === null) return null;
  const isCurrent = () =>
    canContinue() && progressOwnership.isCurrent(token, session.id);
  const reverse = async () => {
    if (session.direction === 'forward') {
      navigationController.clearQueuedNavigation();
      setOwnedProgress(
        progressOwnership,
        token,
        session.id,
        progress,
        Math.max(progress.value, 0.12)
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
      if (!isCurrent()) return;
      await ctx.refreshActiveSessionMetrics('source');
      if (!isCurrent()) return;
    }
    if (!isCurrent()) return;
    await ctx.commitReverseTransition({
      sessionId: session.id,
      token,
      navigateBack,
      options,
    });
  };
  return { token, completion: reverse() };
}

export interface RunReverseTransitionArgs {
  ctx: ChoreographyContextType;
  /** Shared element group ID from provider lineage or legacy route params. */
  groupId: string;
  /** Screen we are returning TO (the original forward source). */
  sourceScreenId: string;
  /** Screen we are leaving (the original forward target). */
  currentScreenId: string;
  /** Pop the route. Always invoked, even on failure, so the user is not stuck. */
  popAction: CommitBackNavigation;
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
    navigationController,
    captureSourceGroup,
    startTransition,
    cancelTransition,
    completeTransition,
    waitForOverlayReady,
  } = ctx;
  if (!navigationController.acquireNavigationLock(currentScreenId)) return;
  const trace = ctx.onPreparationTrace
    ? new PreparationTrace(
        {
          groupId,
          sourceScreenId: currentScreenId,
          targetScreenId: sourceScreenId,
          direction: 'backward',
        },
        ctx.onPreparationTrace
      )
    : undefined;
  const navigationToken = navigationController.getNavigationLockToken();
  let reverseSessionId: string | null = null;
  const preparationVersion = progressOwnership.version;
  let animationToken: number | null = null;
  let navigationCommitted = false;
  let navigationResult: Promise<NavigationCommitResult | void> | null = null;
  const commitNavigation = () => {
    if (
      navigationCommitted ||
      !canContinue() ||
      (reverseSessionId
        ? !progressOwnership.isSession(reverseSessionId)
        : progressOwnership.version !== preparationVersion)
    ) {
      return Promise.resolve({ removed: false, presented: false });
    }
    navigationCommitted = true;
    const result = popAction();
    navigationResult = Promise.resolve(result);
    return result;
  };
  const commitFallbackNavigation = async () => {
    try {
      if (navigationCommitted && !navigationResult)
        return isRouteRemoved?.() ?? false;
      const result = await (navigationResult ?? commitNavigation());
      return result?.removed ?? isRouteRemoved?.() ?? true;
    } catch {
      return isRouteRemoved?.() ?? false;
    }
  };
  const endFallbackSession = (sessionId: string, returned: boolean) => {
    if (
      animationToken === null
        ? !progressOwnership.isSession(sessionId)
        : !progressOwnership.isCurrent(animationToken, sessionId)
    )
      return;
    if (!returned) {
      cancelTransition(sessionId);
      return;
    }
    if (animationToken !== null)
      setOwnedProgress(
        progressOwnership,
        animationToken,
        sessionId,
        progress,
        0
      );
    completeTransition(sessionId);
  };

  try {
    debugLog('[BackIntercept] captureSourceGroup start');
    const endSource = trace?.start('source-capture');
    await captureSourceGroup(groupId, currentScreenId);
    endSource?.();
    if (!canContinue() || progressOwnership.version !== preparationVersion)
      return;
    debugLog('[BackIntercept] captureSourceGroup done');

    const endCoordinator = trace?.start('coordinator');
    const reverseSession = await startTransition({
      groupId,
      sourceScreenId: currentScreenId,
      targetScreenId: sourceScreenId,
      direction: 'backward',
      ...(trace ? { trace } : {}),
      onUnavailable: (sessionId) => {
        reverseSessionId = sessionId;
        commitNavigation();
      },
    });
    endCoordinator?.();
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
    trace?.setSession(reverseSession.id);
    animationToken = progressOwnership.claim(reverseSessionId);
    if (animationToken === null) return;

    const endOverlay = trace?.start('overlay-ready');
    const overlayReady = await waitForOverlayReady(
      reverseSession.id,
      trace
        ? () => {
            endOverlay?.({ ready: false, acknowledged: false });
            trace.finish('overlay-timeout');
          }
        : undefined
    );
    const acknowledged =
      overlayReady && (ctx.isOverlayPresented?.(reverseSession.id) ?? true);
    endOverlay?.({ ready: overlayReady, acknowledged });
    if (!progressOwnership.isCurrent(animationToken, reverseSession.id)) return;
    if (!overlayReady || !canContinue()) {
      // Unready overlay content must not swallow a requested Back action.
      const returned =
        !overlayReady && canContinue() && (await commitFallbackNavigation());
      endFallbackSession(reverseSession.id, returned);
      return;
    }
    trace?.finish(acknowledged ? 'overlay-ready' : 'overlay-timeout');
    await ctx.commitReverseTransition({
      sessionId: reverseSession.id,
      token: animationToken,
      options: { spring },
      navigateBack: async () => {
        const result = await commitNavigation();
        return (
          result ?? {
            removed: isRouteRemoved?.() ?? true,
            presented: false,
          }
        );
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
      endFallbackSession(reverseSessionId, await commitFallbackNavigation());
      return;
    }
    commitNavigation();
  } finally {
    trace?.finish('cancelled');
    if (!reverseSessionId || !progressOwnership.isSession(reverseSessionId)) {
      navigationController.releaseNavigationLock(navigationToken);
    }
  }
}

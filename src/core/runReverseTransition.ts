import type { CommitBackNavigation } from './navigationCommit';
import type { ChoreographyContextType } from './ChoreographyContext';
import { PreparationTrace } from './preparationTrace';
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
    progressOwnership,
    navigationController,
    preMeasureGroup,
    startTransition,
    cancelTransition,
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
    return popAction();
  };

  try {
    debugLog('[BackIntercept] preMeasureGroup start');
    const endSource = trace?.start('source-measure');
    await preMeasureGroup(groupId, currentScreenId);
    endSource?.();
    if (!canContinue() || progressOwnership.version !== preparationVersion)
      return;
    debugLog('[BackIntercept] preMeasureGroup done');

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
    const overlayReady = await waitForOverlayReady(reverseSession.id);
    const acknowledged =
      overlayReady && (ctx.isOverlayPresented?.(reverseSession.id) ?? true);
    endOverlay?.({ ready: overlayReady, acknowledged });
    if (!progressOwnership.isCurrent(animationToken, reverseSession.id)) return;
    if (!overlayReady || !canContinue()) {
      // Unready overlay content must not swallow a requested Back action.
      if (!overlayReady && canContinue()) await commitNavigation();
      cancelTransition(reverseSession.id);
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
      commitNavigation();
      cancelTransition(reverseSessionId);
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

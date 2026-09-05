import { withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { ChoreographyContextType } from './ChoreographyContext';
import { FAST_SPRING } from './constants';
import type { SpringConfig } from '../types';
import { debugLog } from '../debug/logger';

function logSpringSettled(finished: boolean) {
  debugLog(`[BackIntercept] spring callback fired finished=${finished}`);
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
  popAction: () => void;
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
    spring = FAST_SPRING,
  } = args;
  const {
    progress,
    preMeasureGroup,
    startTransition,
    completeTransition,
    cancelTransition,
    waitForOverlayReady,
  } = ctx;
  let reverseSessionId: string | null = null;
  let navigationCommitted = false;
  const commitNavigation = () => {
    if (navigationCommitted) {
      return;
    }
    navigationCommitted = true;
    popAction();
  };

  try {
    debugLog('[BackIntercept] preMeasureGroup start');
    await preMeasureGroup(groupId, currentScreenId);
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

    // Wait for the overlay to actually paint and the native host to ack the
    // presentation BEFORE we pop the route. Without this:
    //   * overlay → handleOverlayReady → syncHiddenElements never runs in
    //     time, so the real source/target elements stay visible alongside
    //     the overlay,
    //   * popping the route unmounts the source screen during the gap and
    //     the user just sees the destination snap into place.
    // The provider has a 150ms safety net for slow Android frames.
    const overlayReady = await waitForOverlayReady(reverseSession.id);
    if (!overlayReady) {
      cancelTransition(reverseSession.id);
      return;
    }
    debugLog('[BackIntercept] overlay ready, calling popAction');
    commitNavigation();
    debugLog('[BackIntercept] popAction returned, scheduling spring');

    const sessionId = reverseSession.id;
    progress.value = withSpring(0, spring, (finished) => {
      'worklet';
      scheduleOnRN(logSpringSettled, finished ?? false);
      if (finished) {
        progress.value = 0;
        scheduleOnRN(completeTransition, sessionId);
      }
    });
  } catch (error) {
    debugLog(
      `[BackIntercept] reverse transition error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    if (reverseSessionId) {
      cancelTransition(reverseSessionId);
    }
    commitNavigation();
  }
}

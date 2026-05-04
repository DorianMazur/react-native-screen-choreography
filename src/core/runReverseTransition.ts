import { withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { ChoreographyContextType } from './ChoreographyContext';
import { FAST_SPRING } from './constants';
import type { SpringConfig } from '../types';
import { debugLog } from '../debug/logger';

function logSpringSettled(finished: boolean) {
  debugLog(`[BackIntercept] spring callback fired finished=${finished}`);
}

/**
 * Shared reverse-transition runner used by:
 *  - the back-navigation interceptor in {@link ChoreographyScreen}
 *  - the standalone-reverse path in `useChoreographyNavigation.goBack`
 *
 * Caller controls when the route is actually popped via {@link Args.popAction}
 * so this helper can be driven from either an explicit `goBack()` (where we
 * dispatch `navigation.goBack()` ourselves) or from a `beforeRemove` listener
 * (where we re-dispatch `e.data.action` after `preventDefault`).
 */
export interface RunReverseTransitionArgs {
  ctx: ChoreographyContextType;
  /** Shared element group id (the `_choreographyGroup` route param). */
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
    waitForOverlayReady,
  } = ctx;

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
      popAction();
      return;
    }

    // Wait for the overlay to actually paint and the native host to ack the
    // presentation BEFORE we pop the route. Without this:
    //   * overlay → handleOverlayReady → syncHiddenElements never runs in
    //     time, so the real source/target elements stay visible alongside
    //     the overlay,
    //   * popping the route unmounts the source screen during the gap and
    //     the user just sees the destination snap into place.
    // The provider has a 150ms safety net for slow Android frames.
    await waitForOverlayReady(reverseSession.id);
    debugLog('[BackIntercept] overlay ready, calling popAction');
    popAction();
    debugLog('[BackIntercept] popAction returned, scheduling spring');

    progress.value = withSpring(0, spring, (finished) => {
      'worklet';
      scheduleOnRN(logSpringSettled, finished ?? false);
      if (finished) {
        progress.value = 0;
        scheduleOnRN(completeTransition);
      }
    });
  } catch (error) {
    debugLog(
      `[BackIntercept] reverse transition error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    popAction();
  }
}

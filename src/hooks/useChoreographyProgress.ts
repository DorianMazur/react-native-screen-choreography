import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  useAnimatedStyle,
  interpolate,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ChoreographyControlsContext } from '../core/ChoreographyContext';
import { ChoreographyProgressContext } from '../core/ChoreographyProgressContext';
import { useScreenId } from '../core/screenIdContext';
import { PROGRESS_RANGES, DEFAULT_BACKDROP_OPACITY } from '../core/constants';

export function useChoreographyControls() {
  const controls = useContext(ChoreographyControlsContext);
  if (!controls) {
    throw new Error(
      'useChoreographyControls must be used within a <ChoreographyProvider>'
    );
  }
  const screenId = useScreenId();
  const settle = controls.settleTransition;
  const settleTransition = useCallback(
    () => settle(screenId),
    [settle, screenId]
  );
  return { settleTransition };
}

/**
 * Hook to access the transition progress shared value.
 * Use this to create companion animations that respond to transition progress
 * and to settle the active session in favor of the current screen when the user
 * starts interacting before the transition has fully finished.
 *
 * @example
 * ```tsx
 * const { backdropStyle, settleTransition } = useChoreographyProgress();
 *
 * <ScrollView onScrollBeginDrag={settleTransition}>
 *   <Animated.View style={[styles.backdrop, backdropStyle]} />
 * </ScrollView>
 * ```
 */
export function useChoreographyProgress() {
  const controls = useContext(ChoreographyControlsContext);
  const state = useContext(ChoreographyProgressContext);
  if (!controls || !state) {
    throw new Error(
      'useChoreographyProgress must be used within a <ChoreographyProvider>'
    );
  }

  const { progress } = controls;
  const { settleTransition } = useChoreographyControls();

  const backdropStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        progress.value,
        [PROGRESS_RANGES.backdrop.start, PROGRESS_RANGES.backdrop.end],
        [0, DEFAULT_BACKDROP_OPACITY],
        'clamp'
      ),
    };
  });

  return {
    progress,
    backdropStyle,
    ...state,
    settleTransition,
  };
}

let nextRevealObservation = 0;

/**
 * Mount companion content after this screen's active transition reaches a
 * threshold. Once visible, content stays mounted until resetKey changes.
 * Unopened pending destinations stay closed before a session exists.
 */
export function useLatchedReveal(
  config: {
    startProgress?: number;
    resetKey?: unknown;
    visibleWhenInactive?: boolean;
  } = {}
) {
  const controls = useContext(ChoreographyControlsContext);
  const state = useContext(ChoreographyProgressContext);
  if (!controls || !state) {
    throw new Error(
      'useLatchedReveal must be used within a <ChoreographyProvider>'
    );
  }

  const {
    startProgress = PROGRESS_RANGES.contentReveal.start,
    resetKey,
    visibleWhenInactive = true,
  } = config;

  const { progress } = controls;
  const { isPendingTarget, phase, role, direction, sessionId } = state;
  const preparing =
    isPendingTarget ||
    (role === 'target' && phase === 'preparing' && direction === 'forward');
  const visibleAtRest =
    !preparing &&
    visibleWhenInactive &&
    (phase === 'idle' || role === 'inactive');
  const gate = useMemo(() => ({ resetKey }), [resetKey]);
  const [revealedGate, setRevealedGate] = useState<typeof gate | null>(() =>
    visibleAtRest ? gate : null
  );
  useLayoutEffect(() => {
    // Keep content already shown at rest mounted when this screen departs or
    // participates again. A different content identity must change resetKey.
    if (visibleAtRest) setRevealedGate(gate);
  }, [gate, visibleAtRest]);
  const canObserve =
    revealedGate !== gate &&
    !preparing &&
    phase === 'active' &&
    role !== 'inactive';
  const observation = useMemo(
    () => ({
      gate,
      sessionId,
      canObserve,
      startProgress,
      progress,
      token: ++nextRevealObservation,
      mounted: false,
    }),
    [gate, sessionId, canObserve, startProgress, progress]
  );
  const { token } = observation;

  useLayoutEffect(() => {
    observation.mounted = true;
    return () => {
      // A queued UI-to-RN callback can outlive its session or reset key.
      observation.mounted = false;
    };
  }, [observation]);

  const reveal = useCallback(() => {
    if (observation.mounted) setRevealedGate(gate);
  }, [gate, observation]);

  useAnimatedReaction(
    () => (canObserve && progress.value >= startProgress ? token : 0),
    (current, previous) => {
      // A fresh observer must notify even if the previous threshold was true.
      if (current !== 0 && current !== previous) {
        scheduleOnRN(reveal);
      }
    },
    [canObserve, progress, reveal, startProgress, token]
  );

  return revealedGate === gate || visibleAtRest;
}

import { useCallback, useContext, useEffect, useState } from 'react';
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

/**
 * Hook for conditionally rendering companion content once transition progress
 * reaches a threshold. The gate stays open after it is first revealed, and can
 * also stay open whenever no choreography session is active.
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
  const { isActive } = state;

  const computeVisible = useCallback(() => {
    return (
      (visibleWhenInactive && !isActive) || progress.value >= startProgress
    );
  }, [isActive, progress, startProgress, visibleWhenInactive]);

  const [isVisible, setIsVisible] = useState(() => computeVisible());

  useEffect(() => {
    setIsVisible(computeVisible());
  }, [computeVisible, resetKey]);

  const reveal = useCallback(() => {
    setIsVisible(true);
  }, []);

  useAnimatedReaction(
    () => progress.value >= startProgress,
    (shouldShow, previousShouldShow) => {
      if (shouldShow && !previousShouldShow) {
        scheduleOnRN(reveal);
      }
    },
    [progress, reveal, startProgress]
  );

  return isVisible;
}

/**
 * Hook for staggered content reveals tied to transition progress.
 *
 * @param itemCount - Number of items to stagger
 * @param config - Configuration for the stagger effect
 */
export function useStaggeredReveal(
  itemCount: number,
  config: {
    startProgress?: number;
    endProgress?: number;
    stagger?: number;
    translateY?: number;
  } = {}
) {
  const ctx = useContext(ChoreographyControlsContext);
  if (!ctx) {
    throw new Error(
      'useStaggeredReveal must be used within a <ChoreographyProvider>'
    );
  }

  const {
    startProgress = PROGRESS_RANGES.contentReveal.start,
    endProgress = PROGRESS_RANGES.contentReveal.end,
    stagger = 0.05,
    translateY = 16,
  } = config;

  const { progress } = ctx;
  const totalRange = endProgress - startProgress;
  const itemDuration = Math.max(
    0.1,
    totalRange - stagger * Math.max(0, itemCount - 1)
  );

  function getItemStyle(index: number) {
    const itemStart = startProgress + stagger * index;
    const itemEnd = Math.min(itemStart + itemDuration, 1);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAnimatedStyle(() => {
      return {
        opacity: interpolate(
          progress.value,
          [itemStart, itemEnd],
          [0, 1],
          'clamp'
        ),
        transform: [
          {
            translateY: interpolate(
              progress.value,
              [itemStart, itemEnd],
              [translateY, 0],
              'clamp'
            ),
          },
        ],
      };
    });
  }

  return { getItemStyle, progress };
}

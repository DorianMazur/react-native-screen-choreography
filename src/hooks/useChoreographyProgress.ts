import { useCallback, useContext, useEffect, useState } from 'react';
import {
  useAnimatedStyle,
  interpolate,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from './ChoreographyContext';
import { useScreenId } from './useScreenId';
import { PROGRESS_RANGES, DEFAULT_BACKDROP_OPACITY } from '../constants';

function resolveSettledProgress(
  activeSession: ChoreographyContextType['activeSession'],
  screenId: string
) {
  if (!activeSession) {
    return null;
  }

  if (screenId === activeSession.sourceScreenId) {
    return activeSession.direction === 'forward' ? 0 : 1;
  }

  if (screenId === activeSession.targetScreenId) {
    return activeSession.direction === 'forward' ? 1 : 0;
  }

  return activeSession.direction === 'forward' ? 1 : 0;
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
  const ctx = useContext(ChoreographyContext) as ChoreographyContextType;
  if (!ctx) {
    throw new Error(
      'useChoreographyProgress must be used within a <ChoreographyProvider>'
    );
  }

  const screenId = useScreenId();
  const { progress, activeSession, completeTransition } = ctx;
  const isActive = activeSession !== null;

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

  const settleTransition = useCallback(() => {
    const settledProgress = resolveSettledProgress(activeSession, screenId);
    if (settledProgress === null) {
      return;
    }

    progress.value = settledProgress;
    completeTransition();
  }, [activeSession, completeTransition, progress, screenId]);

  return {
    progress,
    backdropStyle,
    isActive,
    settleTransition,
  };
}

/**
 * Hook for a generic progress-driven reveal style.
 * Useful for supporting visual content such as charts, media, summaries,
 * or any other block that should fade and lift into place after the main
 * geometry has mostly settled.
 */
export function useProgressRevealStyle(
  config: {
    startProgress?: number;
    endProgress?: number;
    fromOpacity?: number;
    toOpacity?: number;
    fromTranslateY?: number;
    toTranslateY?: number;
  } = {}
) {
  const ctx = useContext(ChoreographyContext) as ChoreographyContextType;
  if (!ctx) {
    throw new Error(
      'useProgressRevealStyle must be used within a <ChoreographyProvider>'
    );
  }

  const {
    startProgress = PROGRESS_RANGES.supportingReveal.start,
    endProgress = PROGRESS_RANGES.supportingReveal.end,
    fromOpacity = 0,
    toOpacity = 1,
    fromTranslateY = 20,
    toTranslateY = 0,
  } = config;

  const { progress } = ctx;

  return useAnimatedStyle(() => {
    return {
      opacity: interpolate(
        progress.value,
        [startProgress, endProgress],
        [fromOpacity, toOpacity],
        'clamp'
      ),
      transform: [
        {
          translateY: interpolate(
            progress.value,
            [startProgress, endProgress],
            [fromTranslateY, toTranslateY],
            'clamp'
          ),
        },
      ],
    };
  });
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
  const ctx = useContext(ChoreographyContext) as ChoreographyContextType;
  if (!ctx) {
    throw new Error(
      'useLatchedReveal must be used within a <ChoreographyProvider>'
    );
  }

  const {
    startProgress = PROGRESS_RANGES.contentReveal.start,
    resetKey,
    visibleWhenInactive = true,
  } = config;

  const { progress, activeSession } = ctx;
  const isActive = activeSession !== null;

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
  } = {}
) {
  const ctx = useContext(ChoreographyContext) as ChoreographyContextType;
  if (!ctx) {
    throw new Error(
      'useStaggeredReveal must be used within a <ChoreographyProvider>'
    );
  }

  const {
    startProgress = PROGRESS_RANGES.contentReveal.start,
    endProgress = PROGRESS_RANGES.contentReveal.end,
    stagger = 0.05,
  } = config;

  const { progress } = ctx;
  const totalRange = endProgress - startProgress;
  const itemDuration = Math.max(
    0.1,
    totalRange - stagger * Math.max(0, itemCount - 1)
  );

  /**
   * Get animated style for a specific item index.
   */
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
              [16, 0],
              'clamp'
            ),
          },
        ],
      };
    });
  }

  return { getItemStyle, progress };
}

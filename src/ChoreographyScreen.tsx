import React, { useCallback, useContext, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { ScreenIdContext } from './hooks/useScreenId';
import { ChoreographyContext } from './hooks/ChoreographyContext';

interface ChoreographyScreenProps {
  screenId: string;
  children: React.ReactNode;
}

export function ChoreographyScreen({
  screenId,
  children,
}: ChoreographyScreenProps) {
  const choreography = useContext(ChoreographyContext);
  const readinessTokenRef = useRef(0);
  const isPendingTarget = choreography?.pendingTargetScreenId === screenId;
  const isActiveForwardTarget =
    choreography?.activeSession?.state === 'active' &&
    choreography.activeSession.direction === 'forward' &&
    choreography.activeSession.targetScreenId === screenId;
  const isActiveForwardSource =
    choreography?.activeSession?.state === 'active' &&
    choreography.activeSession.direction === 'forward' &&
    choreography.activeSession.sourceScreenId === screenId;
  const progress = choreography?.progress ?? null;

  const revealStyle = useAnimatedStyle(() => {
    if (isPendingTarget) {
      return { opacity: 0 };
    }
    if (isActiveForwardTarget) {
      // Gate on progress > 0 (evaluated on the UI thread) rather than
      // revealing immediately. By the time the spring moves at all,
      // syncHiddenElements has already run and the per-element hidden SVs
      // have propagated to the UI thread — so the destination content is
      // visible while the shared elements remain hidden via isElementHidden.
      return { opacity: progress && progress.value > 0.001 ? 1 : 0 };
    }
    if (isActiveForwardSource) {
      // Fade out the source screen's non-shared content (other rows, header,
      // etc.) so only the overlay stand-ins are visible during the transition.
      // Shared elements are already individually hidden via isElementHidden.
      return {
        opacity: progress
          ? interpolate(progress.value, [0, 0.4], [1, 0], 'clamp')
          : 1,
      };
    }
    return { opacity: 1 };
  }, [
    choreography,
    isActiveForwardTarget,
    isActiveForwardSource,
    isPendingTarget,
    progress,
  ]);

  useEffect(() => {
    choreography?.setScreenReady(screenId, false);

    return () => {
      readinessTokenRef.current += 1;
      choreography?.unregisterScreen(screenId);
    };
  }, [choreography, screenId]);

  const handleLayout = useCallback(() => {
    if (!choreography) {
      return;
    }

    readinessTokenRef.current += 1;
    const token = readinessTokenRef.current;
    choreography.setScreenReady(screenId, false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (readinessTokenRef.current === token) {
          choreography.setScreenReady(screenId, true);
        }
      });
    });
  }, [choreography, screenId]);

  return (
    <ScreenIdContext.Provider value={screenId}>
      <Animated.View
        onLayout={handleLayout}
        style={[styles.container, revealStyle]}
        pointerEvents={
          isPendingTarget || isActiveForwardTarget ? 'none' : 'auto'
        }
      >
        {children}
      </Animated.View>
    </ScreenIdContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

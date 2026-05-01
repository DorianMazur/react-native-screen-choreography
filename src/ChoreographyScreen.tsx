import React, { useCallback, useContext, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { ScreenIdContext } from './hooks/useScreenId';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
} from './hooks/ChoreographyContext';
import {
  deriveScreenOpacity,
  getScreenRole,
  getSessionPhase,
  shouldBlockInteraction,
} from './screenVisibility';

interface ChoreographyScreenProps {
  screenId: string;
  children: React.ReactNode;
}

export function ChoreographyScreen({
  screenId,
  children,
}: ChoreographyScreenProps) {
  // Volatile session state from ChoreographyContext; stable lifecycle
  // callbacks from ChoreographyActionsContext so registration never
  // re-runs on session changes.
  const choreography = useContext(ChoreographyContext);
  const actions = useContext(ChoreographyActionsContext);
  const readinessTokenRef = useRef(0);

  const session = choreography?.activeSession ?? null;
  const pendingTargetScreenId = choreography?.pendingTargetScreenId ?? null;
  const progress = choreography?.progress ?? null;

  // Direction-agnostic visibility derived from (direction, role, phase, t).
  const role = getScreenRole(session, screenId);
  const phase = getSessionPhase(session, pendingTargetScreenId, screenId);
  const direction = session?.direction ?? 'forward';

  const isPendingTarget = pendingTargetScreenId === screenId;
  const staticOpacity =
    isPendingTarget || (role === 'target' && phase === 'preparing') ? 0 : 1;

  const revealStyle = useAnimatedStyle(() => {
    const value = progress?.value ?? 0;
    return { opacity: deriveScreenOpacity(direction, role, phase, value) };
  }, [direction, role, phase, progress]);

  const blockInteraction =
    isPendingTarget || shouldBlockInteraction(role, phase);

  // Effect deps are all stable; session changes must NOT re-run this.
  const setScreenReady = actions?.setScreenReady;
  const unregisterScreen = actions?.unregisterScreen;
  useEffect(() => {
    setScreenReady?.(screenId, false);

    return () => {
      readinessTokenRef.current += 1;
      unregisterScreen?.(screenId);
    };
  }, [screenId, setScreenReady, unregisterScreen]);

  const handleLayout = useCallback(() => {
    if (!setScreenReady) {
      return;
    }

    readinessTokenRef.current += 1;
    const token = readinessTokenRef.current;
    setScreenReady(screenId, false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (readinessTokenRef.current === token) {
          setScreenReady(screenId, true);
        }
      });
    });
  }, [screenId, setScreenReady]);

  return (
    <ScreenIdContext.Provider value={screenId}>
      <View
        onLayout={handleLayout}
        style={[styles.container, { opacity: staticOpacity }]}
        pointerEvents={blockInteraction ? 'none' : 'auto'}
      >
        <Animated.View style={[styles.container, revealStyle]}>
          {children}
        </Animated.View>
      </View>
    </ScreenIdContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

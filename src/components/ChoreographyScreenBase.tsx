import React, { useCallback, useContext, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { ScreenIdContext } from '../core/screenIdContext';
import { ChoreographyProgressProvider } from '../core/ChoreographyProgressContext';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
} from '../core/ChoreographyContext';
import {
  deriveScreenOpacity,
  getScreenRole,
  getSessionPhase,
  shouldBlockInteraction,
} from '../core/screenVisibility';

export interface ChoreographyScreenProps {
  screenId: string;
  children: React.ReactNode;
  /** Additional app readiness gate applied after the screen has laid out. */
  ready?: boolean;
}

export function ChoreographyScreenBase({
  screenId: screenName,
  instanceId,
  isFocused = true,
  children,
  ready = true,
}: ChoreographyScreenProps & { instanceId?: string; isFocused?: boolean }) {
  const screenId = instanceId ?? screenName;
  const choreography = useContext(ChoreographyContext);
  const actions = useContext(ChoreographyActionsContext);
  const readinessTokenRef = useRef(0);
  const layoutReadyRef = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const session = choreography?.activeSession ?? null;
  const pendingTargetScreenId = choreography?.pendingTargetScreenId ?? null;
  const progress = choreography?.progress ?? null;
  const isPendingTarget =
    pendingTargetScreenId === screenId ||
    (pendingTargetScreenId === screenName &&
      choreography?.pendingSourceScreenId !== screenId &&
      isFocused);
  const role = getScreenRole(session, screenId);
  const phase = getSessionPhase(
    session,
    isPendingTarget ? screenId : null,
    screenId
  );
  const direction = session?.direction ?? 'forward';
  const staticOpacity =
    isPendingTarget && direction === 'forward'
      ? 0
      : role === 'target' && phase === 'preparing' && direction === 'forward'
        ? 0
        : 1;

  const revealStyle = useAnimatedStyle(() => {
    const value = progress?.value ?? 0;
    return { opacity: deriveScreenOpacity(direction, role, phase, value) };
  }, [direction, role, phase, progress]);

  const blockInteraction =
    isPendingTarget || shouldBlockInteraction(role, phase);
  const setScreenReady = actions?.setScreenReady;
  const unregisterScreen = actions?.unregisterScreen;

  useEffect(() => {
    setScreenReady?.(screenId, false, screenName);

    return () => {
      readinessTokenRef.current += 1;
      unregisterScreen?.(screenId);
    };
  }, [screenId, screenName, setScreenReady, unregisterScreen]);

  useEffect(() => {
    if (!ready) {
      setScreenReady?.(screenId, false);
    } else if (layoutReadyRef.current) {
      setScreenReady?.(screenId, true);
    }
  }, [ready, screenId, setScreenReady]);

  const handleLayout = useCallback(() => {
    if (!setScreenReady) {
      return;
    }

    readinessTokenRef.current += 1;
    const token = readinessTokenRef.current;
    layoutReadyRef.current = false;
    setScreenReady(screenId, false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (readinessTokenRef.current === token) {
          layoutReadyRef.current = true;
          setScreenReady(screenId, readyRef.current);
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
          <ChoreographyProgressProvider>
            {children}
          </ChoreographyProgressProvider>
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

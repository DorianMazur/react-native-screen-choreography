import React, { useCallback, useContext, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ScreenIdContext } from '../core/screenIdContext';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import {
  deriveScreenOpacity,
  getScreenRole,
  getSessionPhase,
  shouldBlockInteraction,
} from '../core/screenVisibility';
import { runReverseTransition } from '../core/runReverseTransition';

interface ChoreographyScreenProps {
  screenId: string;
  children: React.ReactNode;
  /** Additional app readiness gate applied after the screen has laid out. */
  ready?: boolean;
}

export function ChoreographyScreen({
  screenId,
  children,
  ready = true,
}: ChoreographyScreenProps) {
  // Volatile session state from ChoreographyContext; stable lifecycle
  // callbacks from ChoreographyActionsContext so registration never
  // re-runs on session changes.
  const choreography = useContext(ChoreographyContext);
  const actions = useContext(ChoreographyActionsContext);
  const readinessTokenRef = useRef(0);
  const layoutReadyRef = useRef(false);

  const ctxRef = useRef<ChoreographyContextType | null>(choreography);
  useEffect(() => {
    ctxRef.current = choreography;
  }, [choreography]);

  const navigation = useNavigation<any>();
  const route = useRoute();

  const session = choreography?.activeSession ?? null;
  const pendingTargetScreenId = choreography?.pendingTargetScreenId ?? null;
  const progress = choreography?.progress ?? null;

  // Direction-agnostic visibility derived from (direction, role, phase, t).
  const role = getScreenRole(session, screenId);
  const phase = getSessionPhase(session, pendingTargetScreenId, screenId);
  const direction = session?.direction ?? 'forward';

  const isPendingTarget = pendingTargetScreenId === screenId;
  // For backward transitions the target screen is already mounted and
  // visible underneath the source — hiding it during `preparing` would
  // cause a black flash for the ~150ms before the session activates.
  // Only hide forward targets (newly mounted screens that should remain
  // invisible until the overlay swaps them in).
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

  useEffect(() => {
    if (!ready) {
      setScreenReady?.(screenId, false);
    } else if (layoutReadyRef.current) {
      setScreenReady?.(screenId, true);
    }
  }, [ready, screenId, setScreenReady]);

  const dispatchingSelfRef = useRef(false);
  useEffect(() => {
    if (!navigation?.addListener) {
      return;
    }

    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (dispatchingSelfRef.current) {
        dispatchingSelfRef.current = false;
        return;
      }

      const ctx = ctxRef.current;
      if (!ctx) {
        return;
      }

      if (ctx.activeSession) {
        return;
      }

      const params = (route?.params ?? {}) as Record<string, unknown>;
      const groupId = params._choreographyGroup as string | undefined;
      const sourceScreenId = params._choreographySourceScreen as
        | string
        | undefined;

      if (!groupId || !sourceScreenId) {
        return;
      }

      e.preventDefault();

      runReverseTransition({
        ctx,
        groupId,
        sourceScreenId,
        currentScreenId: screenId,
        popAction: () => {
          dispatchingSelfRef.current = true;
          navigation.dispatch(e.data.action);
        },
      }).catch(() => {
        // runReverseTransition swallows its own errors and always calls
        // popAction; this catch is just to satisfy lint's no-floating-promises.
      });
    });

    return unsubscribe;
  }, [navigation, route, screenId]);

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
          setScreenReady(screenId, ready);
        }
      });
    });
  }, [ready, screenId, setScreenReady]);

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

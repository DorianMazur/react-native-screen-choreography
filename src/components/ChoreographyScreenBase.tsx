import React, {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { ScreenIdContext } from '../core/screenIdContext';
import { ChoreographyProgressProvider } from '../core/ChoreographyProgressContext';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  ChoreographyControlsContext,
} from '../core/ChoreographyContext';
import { useScreenAnimationLifetime } from '../hooks/useScreenAnimationLifetime';
import {
  deriveScreenOpacity,
  getScreenRole,
  getSessionPhase,
  shouldBlockInteraction,
  validateScreenFade,
  type ScreenFadeConfig,
} from '../core/screenVisibility';

export interface ChoreographyScreenProps {
  screenId: string;
  children: React.ReactNode;
  /** Additional app readiness gate applied after the screen has laid out. */
  ready?: boolean;
  /** Decorative screen fade in expansion progress. Defaults to [0, 0.4]. */
  screenFade?: ScreenFadeConfig;
  /** Allow touches when this screen is arriving, on iOS and Android. Defaults
   * to true. Set false to defer all arriving-screen touches until completion;
   * prefer disabling individual controls when only those need to wait.
   * Preparation and the outgoing screen remain blocked except for an explicitly
   * owned gesture. This does not enable overlay touches or prevent navigation. */
  allowInteractionDuringTransition?: boolean;
  /**
   * Keep this screen at full opacity during a session instead of
   * cross-fading it with the other endpoint. Use it on the source screen
   * when the destination is transparent and the source is its backdrop.
   */
  keepVisible?: boolean;
}

export function ChoreographyScreenBase({
  screenId: screenName,
  instanceId,
  isFocused = true,
  children,
  ready = true,
  screenFade,
  keepVisible = false,
  allowInteractionDuringTransition = true,
}: ChoreographyScreenProps & { instanceId?: string; isFocused?: boolean }) {
  const screenId = instanceId ?? screenName;
  if (screenFade !== undefined) validateScreenFade(screenFade);
  const choreography = useContext(ChoreographyContext);
  const actions = useContext(ChoreographyActionsContext);
  const controls = useContext(ChoreographyControlsContext);
  const presentationRef = useRef<React.ComponentRef<typeof View> | null>(null);
  const layoutReadyRef = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const session = choreography?.activeSession ?? null;
  const pendingTargetScreenId = choreography?.pendingTargetScreenId ?? null;
  const {
    progress: screenProgress,
    suspended,
    lifetime,
  } = useScreenAnimationLifetime(choreography?.progress ?? null);
  const progress =
    Platform.OS === 'android'
      ? screenProgress
      : (choreography?.progress ?? null);
  const screenControls = useMemo(
    () =>
      controls && Platform.OS === 'android'
        ? { ...controls, progress: screenProgress }
        : controls,
    [controls, screenProgress]
  );
  const isPendingTarget =
    pendingTargetScreenId === screenId ||
    (pendingTargetScreenId === screenName &&
      choreography?.pendingSourceScreenId !== screenId &&
      isFocused);
  const role = getScreenRole(session, screenId);
  const isInteractiveSource =
    role === 'source' && choreography?.interactiveScreenId === screenId;
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
    return {
      opacity: keepVisible
        ? 1
        : deriveScreenOpacity(
            direction,
            role,
            phase,
            value,
            screenFade,
            isInteractiveSource
          ),
    };
  }, [
    direction,
    role,
    phase,
    progress,
    screenFade,
    keepVisible,
    isInteractiveSource,
  ]);

  const blockInteraction =
    isPendingTarget ||
    shouldBlockInteraction(
      role,
      phase,
      allowInteractionDuringTransition,
      false,
      isInteractiveSource
    );
  const interactionOwner = choreography?.interactionOwner;
  const reverseHandoff = choreography?.reverseHandoff;
  const progressOwner = choreography?.progressOwnership?.owner;
  const sessionId = session?.id;
  const screenPointerEvents = useDerivedValue(() => {
    if (suspended.value) return 'none' as const;
    const returning = reverseHandoff?.value;
    const isReturnTarget = Boolean(
      returning &&
      returning.sessionId === sessionId &&
      returning.token === progressOwner?.value &&
      returning.navigationPresented &&
      returning.targetScreenId === screenId
    );
    const blocked =
      isPendingTarget ||
      shouldBlockInteraction(
        role,
        phase,
        allowInteractionDuringTransition,
        isReturnTarget,
        isInteractiveSource
      );
    return blocked && interactionOwner?.value !== screenId
      ? ('none' as const)
      : ('auto' as const);
  });
  const interactionProps = useAnimatedProps(() => ({
    pointerEvents: screenPointerEvents.value,
  }));
  const setScreenReady = actions?.setScreenReady;
  const unregisterScreen = actions?.unregisterScreen;
  const registerScreenPresentation = actions?.registerScreenPresentation;

  useLayoutEffect(
    () => registerScreenPresentation?.(screenId, presentationRef, lifetime),
    [registerScreenPresentation, screenId, lifetime]
  );

  useLayoutEffect(() => {
    // Initialize before native layout events can publish immediate readiness.
    layoutReadyRef.current = false;
    setScreenReady?.(screenId, false, screenName);

    return () => {
      unregisterScreen?.(screenId);
    };
  }, [screenId, screenName, setScreenReady, unregisterScreen]);

  useLayoutEffect(() => {
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

    // Application readiness only. Completed mounting is verified by Fabric capture.
    layoutReadyRef.current = true;
    setScreenReady(screenId, readyRef.current);
  }, [screenId, setScreenReady]);

  return (
    <ScreenIdContext.Provider value={screenId}>
      <View
        onLayout={handleLayout}
        style={[styles.container, { opacity: staticOpacity }]}
        pointerEvents={
          isPendingTarget ||
          (role !== 'inactive' && phase === 'preparing' && !isInteractiveSource)
            ? 'none'
            : 'box-none'
        }
      >
        <Animated.View
          needsOffscreenAlphaCompositing={Platform.OS === 'android'}
          style={[styles.container, revealStyle]}
          pointerEvents={blockInteraction ? 'none' : 'auto'}
          animatedProps={interactionProps}
        >
          <View
            ref={presentationRef}
            collapsable={false}
            style={styles.container}
          >
            <ChoreographyProgressProvider isPendingTarget={isPendingTarget}>
              <ChoreographyControlsContext.Provider value={screenControls}>
                {children}
              </ChoreographyControlsContext.Provider>
            </ChoreographyProgressProvider>
          </View>
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

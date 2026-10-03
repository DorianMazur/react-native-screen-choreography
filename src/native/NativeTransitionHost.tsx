import React, { useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedProps,
  useEvent,
  useFrameCallback,
  useSharedValue,
  useAnimatedRef,
  useAnimatedReaction,
  dispatchCommand,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import NativeScreenChoreographyView, {
  type PresentationReadyEvent,
} from './ScreenChoreographyViewNativeComponent';
import {
  PRESENTATION_TIMEOUT_MS,
  type NativePresentation,
  type PresentationFailureReason,
} from '../core/nativePresentation';
import {
  startOwnedProgressOnUI,
  type ProgressOwnership,
} from '../core/ProgressOwnership';

const AnimatedHost = Animated.createAnimatedComponent(
  NativeScreenChoreographyView
);

interface NativeTransitionHostProps {
  active: boolean;
  ownership: ProgressOwnership;
  progress: SharedValue<number>;
  sessionId?: string;
  presentation?: NativePresentation;
  children?: React.ReactNode;
  onPresentationReady?: (sessionId: string) => void;
  /** Overlay hosts are attached; the session may now move content into them. */
  onAttached?: (sessionId: string) => void;
  onPresentationFailed: (
    sessionId: string,
    reason: PresentationFailureReason
  ) => void;
}

export function NativeTransitionHost({
  active,
  ownership,
  progress,
  sessionId = '',
  presentation,
  children,
  onPresentationReady,
  onAttached,
  onPresentationFailed,
}: NativeTransitionHostProps) {
  const { width, height } = useWindowDimensions();
  const { owner, handoff } = ownership;
  const hostRef =
    useAnimatedRef<React.ComponentRef<typeof NativeScreenChoreographyView>>();
  const deadline = useSharedValue<{ id: string; at: number } | null>(null);
  const frame = useFrameCallback(({ timestamp }) => {
    if (
      !active ||
      !presentation ||
      !presentation.valid.value ||
      presentation.phase.value === 2
    )
      return;
    if (deadline.value?.id !== sessionId)
      deadline.value = {
        id: sessionId,
        at: timestamp + PRESENTATION_TIMEOUT_MS,
      };
    if (timestamp >= deadline.value!.at) {
      presentation.valid.value = false;
      scheduleOnRN(onPresentationFailed, sessionId, 'timeout');
      return;
    }
    if (presentation.phase.value <= 0) {
      presentation.phase.value = -1;
      dispatchCommand(hostRef, 'prepare', [sessionId]);
    }
  }, false);
  const animatedProps = useAnimatedProps(() => ({
    presentationRequested: Boolean(
      presentation && presentation.valid.value && presentation.phase.value >= 1
    ),
  }));
  const onReady = useEvent<PresentationReadyEvent>(
    (event) => {
      'worklet';
      if (
        !active ||
        event.sessionId !== sessionId ||
        !presentation?.valid.value
      )
        return;
      if (event.stage === 'attached' && presentation.phase.value <= 0) {
        presentation.phase.value = 1;
        if (onAttached) scheduleOnRN(onAttached, sessionId);
        return;
      }
      // Native presentation proves attachment and content as well. Its earlier
      // attachment event can arrive before the UI event handler is installed.
      if (event.stage !== 'presented' || presentation.phase.value === 2) return;
      const receivedAtMs = presentation.timing
        ? globalThis.performance.now()
        : 0;
      if (!presentation.validate()) {
        presentation.valid.value = false;
        scheduleOnRN(onPresentationFailed, sessionId, 'invalidated');
        return;
      }
      if (presentation.timing) {
        presentation.timing.value = {
          ...presentation.timing.value,
          presentedAtMs: receivedAtMs,
          native: {
            preparedAtMs: event.preparedAtMs,
            attachedAtMs: event.attachedAtMs,
            contentReadyAtMs: event.contentReadyAtMs,
            presentedAtMs: event.presentedAtMs,
          },
        };
      }
      presentation.phase.value = 2;
      if (onPresentationReady) scheduleOnRN(onPresentationReady, sessionId);
    },
    ['onPresentationReady'],
    true
  );
  useAnimatedReaction(
    () =>
      presentation?.valid.value && presentation.phase.value === 2
        ? presentation.animation.value
        : null,
    (animation) => {
      if (!animation || !presentation || animation.token !== owner.value)
        return;
      presentation.animation.value = null;
      if (
        presentation.timing &&
        presentation.timing.value.animationStartedAtMs === null
      ) {
        presentation.timing.value = {
          ...presentation.timing.value,
          animationStartedAtMs: globalThis.performance.now(),
        };
      }
      startOwnedProgressOnUI({
        ...animation,
        owner,
        handoff,
        progress,
        sessionId,
      });
    }
  );
  useEffect(() => {
    frame.setActive(Boolean(active && presentation));
    return () => frame.setActive(false);
  }, [frame, active, presentation]);
  return (
    <AnimatedHost
      ref={hostRef}
      active={active && Boolean(presentation)}
      sessionId={sessionId}
      expectedHostNames={presentation?.hostNames}
      animatedProps={animatedProps}
      collapsable={false}
      pointerEvents="none"
      style={
        Platform.OS === 'ios'
          ? [styles.windowHost, { width, height }]
          : styles.host
      }
      onPresentationReady={
        onReady as unknown as React.ComponentProps<
          typeof NativeScreenChoreographyView
        >['onPresentationReady']
      }
    >
      {children}
    </AnimatedHost>
  );
}
const styles = StyleSheet.create({
  windowHost: { position: 'absolute', top: 0, left: 0 },
  host: { ...StyleSheet.absoluteFill },
});

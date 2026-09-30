import React, { useEffect } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useEvent,
  useAnimatedReaction,
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
  onPresentationFailed,
}: NativeTransitionHostProps) {
  const { width, height } = useWindowDimensions();
  const { owner, handoff } = ownership;
  const onReady = useEvent<PresentationReadyEvent>(
    (event) => {
      'worklet';
      if (
        !active ||
        event.sessionId !== sessionId ||
        !presentation?.valid.value
      )
        return;
      if (event.stage !== 'presented' || presentation.phase.value === 2) return;
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
    if (!active || !presentation) return;
    const timeout = setTimeout(() => {
      if (!presentation.valid.value || presentation.phase.value === 2) return;
      presentation.valid.value = false;
      onPresentationFailed(sessionId, 'timeout');
    }, PRESENTATION_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [active, presentation, sessionId, onPresentationFailed]);
  return (
    <AnimatedHost
      active={active && Boolean(presentation)}
      sessionId={sessionId}
      expectedHostNames={presentation?.hostNames}
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

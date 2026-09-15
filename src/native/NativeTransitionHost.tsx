import React from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import NativeScreenChoreographyView from './ScreenChoreographyViewNativeComponent';
import NativePreparation from './NativeChoreographyPreparation';

interface NativeTransitionHostProps {
  active: boolean;
  sessionId: string | null;
  children?: React.ReactNode;
  onPresentationReady?: () => void;
}

export function NativeTransitionHost({
  active,
  sessionId,
  children,
  onPresentationReady,
}: NativeTransitionHostProps) {
  const { width, height } = useWindowDimensions();
  const useModuleEvents =
    Platform.OS === 'android' &&
    typeof NativePreparation?.onOverlayPresented === 'function';

  React.useLayoutEffect(() => {
    if (!useModuleEvents || !active || !sessionId) return;
    let listening = true;
    const subscription = NativePreparation!.onOverlayPresented((event) => {
      if (listening && event.sessionId === sessionId) onPresentationReady?.();
    });
    return () => {
      listening = false;
      subscription.remove();
    };
  }, [active, sessionId, onPresentationReady, useModuleEvents]);

  const handlePresentationReady = React.useCallback(() => {
    if (!useModuleEvents) onPresentationReady?.();
  }, [onPresentationReady, useModuleEvents]);

  return (
    <NativeScreenChoreographyView
      active={active}
      presentationSessionId={useModuleEvents && active ? (sessionId ?? '') : ''}
      collapsable={false}
      pointerEvents={active ? 'box-none' : 'none'}
      style={
        Platform.OS === 'ios'
          ? [styles.windowHost, { width, height }]
          : styles.host
      }
      onPresentationReady={handlePresentationReady}
    >
      {children}
    </NativeScreenChoreographyView>
  );
}

const styles = StyleSheet.create({
  windowHost: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  host: {
    ...StyleSheet.absoluteFill,
  },
});

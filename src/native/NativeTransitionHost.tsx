import React from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import NativeScreenChoreographyView from './ScreenChoreographyViewNativeComponent';

interface NativeTransitionHostProps {
  active: boolean;
  children?: React.ReactNode;
  onPresentationReady?: () => void;
}

export function NativeTransitionHost({
  active,
  children,
  onPresentationReady,
}: NativeTransitionHostProps) {
  const { width, height } = useWindowDimensions();
  const handlePresentationReady = React.useCallback(() => {
    onPresentationReady?.();
  }, [onPresentationReady]);

  return (
    <NativeScreenChoreographyView
      active={active}
      collapsable={false}
      pointerEvents="none"
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

import React from 'react';
import { StyleSheet } from 'react-native';
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
  const handlePresentationReady = React.useCallback(() => {
    onPresentationReady?.();
  }, [onPresentationReady]);

  return (
    <NativeScreenChoreographyView
      active={active}
      collapsable={false}
      pointerEvents={active ? 'box-none' : 'none'}
      style={styles.host}
      onPresentationReady={handlePresentationReady}
    >
      {children}
    </NativeScreenChoreographyView>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
  },
});

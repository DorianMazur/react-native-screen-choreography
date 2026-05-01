import React, { useCallback, useContext, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
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
      <View
        onLayout={handleLayout}
        style={[styles.container, isPendingTarget ? styles.hidden : null]}
        pointerEvents={isPendingTarget ? 'none' : 'auto'}
      >
        {children}
      </View>
    </ScreenIdContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
});

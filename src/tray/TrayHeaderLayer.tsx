import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** Keep each route's header mounted through its crossfade, with one input owner. */
export function TrayHeaderLayer({
  children,
  active,
  width,
  progress,
  session,
  transitionId,
}: {
  children: React.ReactNode;
  active: boolean;
  width: number;
  progress: SharedValue<number>;
  session: number;
  transitionId: number | undefined;
}) {
  const fade = useAnimatedStyle(() => {
    const p =
      transitionId === undefined ? 1 : Math.max(0, Math.min(1, progress.value));
    return { opacity: active ? p : 1 - p };
  });
  const [visibleTransition, setVisibleTransition] = useState<{
    session: number;
    id: number;
  }>();
  const request = useRef<{ session: number; id: number } | undefined>(
    undefined
  );
  useLayoutEffect(() => {
    request.current =
      active && transitionId !== undefined
        ? { session, id: transitionId }
        : undefined;
    return () => {
      request.current = undefined;
    };
  }, [active, session, transitionId]);
  const acknowledge = useCallback((owner: number, id: number) => {
    if (request.current?.session === owner && request.current.id === id)
      setVisibleTransition({ session: owner, id });
  }, []);
  useAnimatedReaction(
    () =>
      active && transitionId !== undefined
        ? { session, id: transitionId }
        : undefined,
    (current, previous) => {
      if (
        current &&
        (current.id !== previous?.id || current.session !== previous.session)
      )
        scheduleOnRN(acknowledge, current.session, current.id);
    }
  );
  // Android can deliver the first animated style after the React mount.
  const preparing =
    active &&
    transitionId !== undefined &&
    (visibleTransition?.id !== transitionId ||
      visibleTransition.session !== session);
  const blocked = !active || preparing;
  const staticOpacity = preparing ? 0 : 1;
  return (
    <View
      style={[
        styles.layer,
        !active && styles.outgoing,
        { width, opacity: staticOpacity },
      ]}
      pointerEvents={blocked ? 'none' : 'auto'}
      accessibilityElementsHidden={blocked}
      importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}
    >
      <Animated.View style={fade}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { alignSelf: 'center' },
  outgoing: { position: 'absolute', top: 0 },
});

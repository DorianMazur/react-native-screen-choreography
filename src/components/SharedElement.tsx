import React, {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useContext,
} from 'react';
import { type StyleProp, type ViewStyle, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type { ElementPresentation, SharedElementTransition } from '../types';
import { ChoreographyActionsContext } from '../core/ChoreographyContext';
import { useScreenId } from '../core/screenIdContext';

export interface SharedElementProps {
  /** Unique identifier for this shared element. Must match across screens. */
  id: string;
  /** Group identifier. Elements in the same group transition together. */
  groupId?: string;
  /** Renderer defining exactly how this shared pair animates. */
  transition: SharedElementTransition;
  /** Children to wrap. */
  children: React.ReactNode;
  /** Additional style for the wrapper. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Wraps content participating in a shared transition. Registration is
 * stable per `(id, groupId, screenId)`; the coordinator captures a frozen
 * `ElementPresentation` via `getPresentation()` at session start, so re-renders or
 * prop changes never affect an in-flight overlay.
 */
export function SharedElement({
  id,
  groupId,
  transition,
  children,
  style,
}: SharedElementProps) {
  const viewNodeRef = useRef<any>(null);
  const animatedRef = useAnimatedRef<any>();
  const actions = useContext(ChoreographyActionsContext);
  if (!actions) {
    throw new Error(
      'SharedElement must be used within a <ChoreographyProvider>'
    );
  }
  const { registerElement, unregisterElement, isElementHidden } = actions;
  const screenId = useScreenId();

  const flattenedStyle = useMemo(
    () => (style ? (StyleSheet.flatten(style) as ViewStyle) : undefined),
    [style]
  );
  // Latest-value refs mutated during render so getPresentation() always
  // reflects current props without forcing re-registration.
  const childrenRef = useRef<React.ReactNode>(children);
  childrenRef.current = children;
  const transitionRef = useRef<SharedElementTransition>(transition);
  transitionRef.current = transition;
  const styleRef = useRef<ViewStyle | undefined>(flattenedStyle);
  styleRef.current = flattenedStyle;
  const getPresentation = useCallback<() => ElementPresentation>(
    () => ({
      content: childrenRef.current,
      style: styleRef.current,
      transition: transitionRef.current,
    }),
    []
  );

  const getNode = useCallback(() => viewNodeRef.current, []);
  const setRefs = useCallback(
    (node: any) => {
      viewNodeRef.current = node;
      animatedRef(node);
    },
    [animatedRef]
  );

  // Stable registration. Effect deps are all stable identities.
  useEffect(() => {
    registerElement({
      id,
      groupId,
      screenId,
      ref: getNode,
      animatedRef,
      metrics: null,
      getPresentation,
    });

    return () => {
      unregisterElement(id, screenId, groupId);
    };
  }, [
    id,
    groupId,
    screenId,
    getNode,
    animatedRef,
    getPresentation,
    registerElement,
    unregisterElement,
  ]);

  const hidden = isElementHidden(id, screenId, groupId);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: hidden.value ? 0 : 1,
    };
  });

  return (
    <Animated.View
      ref={setRefs}
      style={[styles.wrapper, style, animatedStyle]}
      collapsable={false}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
});

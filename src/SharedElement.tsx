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
import type { SharedElementTransition } from './types';
import { ChoreographyActionsContext } from './hooks/ChoreographyContext';
import { useScreenId } from './hooks/useScreenId';

export interface SharedElementProps {
  /** Unique identifier for this shared element. Must match across screens. */
  id: string;
  /** Group identifier. Elements in the same group transition together. */
  groupId?: string;
  /** Explicit transition renderer for this shared element pair. */
  transition: SharedElementTransition;
  /** Children to wrap. */
  children: React.ReactNode;
  /** Additional style for the wrapper. */
  style?: StyleProp<ViewStyle>;
}

/**
 * SharedElement wraps content that should participate in shared element transitions.
 *
 * Usage:
 * ```tsx
 * <SharedElement
 *   id="card.1.thumbnail"
 *   groupId="card.1"
 *   transition={thumbnailTransition}
 * >
 *   <Thumbnail />
 * </SharedElement>
 * ```
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

  const renderContent = useCallback(() => children, [children]);
  const getNode = useCallback(() => viewNodeRef.current, []);
  const setRefs = useCallback(
    (node: any) => {
      viewNodeRef.current = node;
      animatedRef(node);
    },
    [animatedRef]
  );

  useEffect(() => {
    registerElement({
      id,
      groupId,
      screenId,
      ref: getNode,
      animatedRef,
      transition,
      metrics: null,
      style: flattenedStyle,
      renderContent,
    });

    return () => {
      unregisterElement(id, screenId);
    };
  }, [
    flattenedStyle,
    getNode,
    id,
    groupId,
    screenId,
    transition,
    unregisterElement,
    registerElement,
    animatedRef,
    renderContent,
  ]);

  const hidden = isElementHidden(id, screenId);

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

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
  type SharedValue,
} from 'react-native-reanimated';
import type { SharedElementConfig } from './types';
import { ChoreographyActionsContext } from './hooks/ChoreographyContext';
import { useScreenId } from './hooks/useScreenId';

export interface SharedElementProps {
  /** Unique identifier for this shared element. Must match across screens. */
  id: string;
  /** Group identifier. Elements in the same group transition together. */
  groupId?: string;
  /** Animation and behavior configuration. */
  config?: SharedElementConfig;
  /** Children to wrap. */
  children: React.ReactNode;
  /** Additional style for the wrapper. */
  style?: StyleProp<ViewStyle>;
  /** Render function for the stand-in during transition (source screen). */
  renderSourceStandIn?: (progress: SharedValue<number>) => React.ReactNode;
  /** Render function for the stand-in during transition (target screen). */
  renderTargetStandIn?: (progress: SharedValue<number>) => React.ReactNode;
}

/**
 * SharedElement wraps content that should participate in shared element transitions.
 *
 * Usage:
 * ```tsx
 * <SharedElement id="card.1.thumbnail" groupId="card.1">
 *   <Thumbnail />
 * </SharedElement>
 * ```
 */
export function SharedElement({
  id,
  groupId,
  config = {},
  children,
  style,
  renderSourceStandIn,
  renderTargetStandIn,
}: SharedElementProps) {
  const viewRef = useRef<any>(null);
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
  const setRefs = useCallback(
    (node: any) => {
      viewRef.current = node;
      animatedRef(node);
    },
    [animatedRef]
  );

  useEffect(() => {
    registerElement({
      id,
      groupId,
      screenId,
      ref: viewRef,
      animatedRef,
      config: {
        ...config,
        renderStandIn: renderSourceStandIn ?? renderTargetStandIn,
      },
      metrics: null,
      style: flattenedStyle,
      renderContent,
    });

    return () => {
      unregisterElement(id, screenId);
    };
    // We intentionally only depend on id and screenId for registration lifecycle.
    // Config changes don't require re-registration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flattenedStyle, id, screenId]);

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

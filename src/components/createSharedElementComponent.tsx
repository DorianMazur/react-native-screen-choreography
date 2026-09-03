import React, {
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ComponentType,
  type ForwardedRef,
} from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { ChoreographyActionsContext } from '../core/ChoreographyContext';
import { useScreenId } from '../core/screenIdContext';
import type { ElementPresentation, SharedElementTransition } from '../types';

type ComponentStyle<Props extends object> = Props extends {
  style?: infer Style;
}
  ? Style
  : StyleProp<ViewStyle>;

export type SharedElementComponentProps<Props extends object> = Omit<
  Props,
  'ref' | 'style'
> & {
  id: string;
  groupId?: string;
  transition: SharedElementTransition;
  style?: ComponentStyle<Props>;
};

function assignRef(ref: ForwardedRef<any>, node: any) {
  if (typeof ref === 'function') {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

export function createSharedElementComponent<Props extends object>(
  Component: ComponentType<Props>
) {
  const AnimatedComponent = Animated.createAnimatedComponent(
    Component as ComponentType<any>
  );

  return forwardRef<any, SharedElementComponentProps<Props>>(
    function SharedElementComponent(rawProps, forwardedRef) {
      const { id, groupId, transition, style, ...componentProps } =
        rawProps as SharedElementComponentProps<Props>;
      const actions = useContext(ChoreographyActionsContext);
      if (!actions) {
        throw new Error(
          'A shared element component must be used within a <ChoreographyProvider>'
        );
      }

      const screenId = useScreenId();
      const viewNodeRef = useRef<any>(null);
      const animatedRef = useAnimatedRef<any>();
      const flattenedStyle = useMemo(
        () =>
          style
            ? (StyleSheet.flatten(style as StyleProp<any>) as ViewStyle)
            : undefined,
        [style]
      );
      const propsRef = useRef(componentProps);
      propsRef.current = componentProps;
      const componentStyleRef = useRef(style);
      componentStyleRef.current = style;
      const transitionRef = useRef(transition);
      transitionRef.current = transition;
      const styleRef = useRef(flattenedStyle);
      styleRef.current = flattenedStyle;

      const getPresentation = useCallback<() => ElementPresentation>(
        () => ({
          content: React.createElement(Component, {
            ...propsRef.current,
            style: componentStyleRef.current,
          } as Props),
          style: styleRef.current,
          transition: transitionRef.current,
        }),
        []
      );
      const getNode = useCallback(() => viewNodeRef.current, []);
      const setRef = useCallback(
        (node: any) => {
          viewNodeRef.current = node;
          animatedRef(node);
          assignRef(forwardedRef, node);
        },
        [animatedRef, forwardedRef]
      );

      React.useEffect(() => {
        actions.registerElement({
          id,
          groupId,
          screenId,
          ref: getNode,
          animatedRef,
          metrics: null,
          getPresentation,
        });
        return () => actions.unregisterElement(id, screenId, groupId);
      }, [
        actions,
        animatedRef,
        getNode,
        getPresentation,
        groupId,
        id,
        screenId,
      ]);

      const hidden = actions.isElementHidden(id, screenId, groupId);
      const hiddenStyle = useAnimatedStyle(() => ({
        opacity: hidden.value ? 0 : 1,
      }));

      return (
        <AnimatedComponent
          {...componentProps}
          ref={setRef}
          style={[style, hiddenStyle]}
        />
      );
    }
  );
}

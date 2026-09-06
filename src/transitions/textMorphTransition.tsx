import React from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import type { SharedElementTransition } from '../types';

function readText(content: React.ReactNode): React.ReactElement<TextProps> {
  if (
    !React.isValidElement<TextProps>(content) ||
    (content.type !== Text && content.type !== Animated.Text) ||
    React.Children.toArray(content.props.children).some(
      (child) => typeof child !== 'string' && typeof child !== 'number'
    )
  ) {
    throw new Error(
      'textMorphTransition requires a direct Text or Animated.Text child with plain text on both sides. Use a custom renderer for rich text or wrapped content.'
    );
  }
  return content;
}

export const textMorphTransition: SharedElementTransition = {
  zIndex: 2,
  renderer: function TextMorphRenderer({
    progress,
    direction,
    source,
    target,
    zIndex,
  }) {
    const sourceText = readText(source.content);
    const targetText = readText(target.content);
    if (
      React.Children.toArray(sourceText.props.children).join('') !==
      React.Children.toArray(targetText.props.children).join('')
    ) {
      throw new Error(
        'textMorphTransition requires identical text on both sides. Use a custom renderer when the content changes.'
      );
    }
    const sourceStyle = StyleSheet.flatten(sourceText.props.style);
    const targetStyle = StyleSheet.flatten(targetText.props.style);
    for (const key of [
      'fontFamily',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'color',
    ] as const) {
      if (sourceStyle?.[key] !== targetStyle?.[key]) {
        throw new Error(
          `textMorphTransition requires matching ${key} on both sides. Use a custom renderer for different typography.`
        );
      }
    }
    const sourceFontSize = sourceStyle?.fontSize ?? 14;
    const targetFontSize = targetStyle?.fontSize ?? sourceFontSize;
    const sourceLineHeight = sourceStyle?.lineHeight;
    const targetLineHeight = targetStyle?.lineHeight;
    if ((sourceLineHeight === undefined) !== (targetLineHeight === undefined)) {
      throw new Error(
        'textMorphTransition requires lineHeight on both sides or neither side.'
      );
    }
    const sourceMarginTop =
      typeof sourceStyle?.marginTop === 'number' ? sourceStyle.marginTop : 0;
    const targetMarginTop =
      typeof targetStyle?.marginTop === 'number' ? targetStyle.marginTop : 0;
    const {
      pageX: sourceX,
      pageY: sourceY,
      width: sourceWidth,
    } = source.metrics;
    const {
      pageX: targetX,
      pageY: targetY,
      width: targetWidth,
    } = target.metrics;
    const timeline = useDerivedValue(() =>
      direction === 'backward' ? 1 - progress.value : progress.value
    );
    const frameStyle = useAnimatedStyle(() => ({
      position: 'absolute',
      left: interpolate(timeline.value, [0, 1], [sourceX, targetX], 'clamp'),
      top: interpolate(timeline.value, [0, 1], [sourceY, targetY], 'clamp'),
      width: interpolate(
        timeline.value,
        [0, 1],
        [sourceWidth, targetWidth],
        'clamp'
      ),
    }));
    const textStyle = useAnimatedStyle(() => ({
      fontSize: interpolate(
        timeline.value,
        [0, 1],
        [sourceFontSize, targetFontSize],
        'clamp'
      ),
      marginTop: interpolate(
        timeline.value,
        [0, 1],
        [sourceMarginTop, targetMarginTop],
        'clamp'
      ),
      ...(sourceLineHeight !== undefined && targetLineHeight !== undefined
        ? {
            lineHeight: interpolate(
              timeline.value,
              [0, 1],
              [sourceLineHeight, targetLineHeight],
              'clamp'
            ),
          }
        : {}),
    }));

    return (
      <Animated.View style={[{ zIndex }, frameStyle]} pointerEvents="none">
        <Animated.Text
          {...sourceText.props}
          style={[sourceText.props.style, textStyle]}
        />
      </Animated.View>
    );
  },
};

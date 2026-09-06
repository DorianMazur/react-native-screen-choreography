import React from 'react';
import { StyleSheet, type TextProps } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import type {
  SharedElementTransition,
  SharedElementTransitionRendererProps,
} from 'react-native-screen-choreography';
import { StandInElement } from '../runtime';
import {
  makeStretchTransition,
  makeSurfaceTransition,
  textMorphTransition,
} from '../sharedHelpers';
import { theme } from '../theme';

export const galleryFrameTransition = makeSurfaceTransition(
  { backgroundColor: theme.surface, borderRadius: theme.radius.lg },
  { backgroundColor: theme.surface, borderRadius: 0 }
);

export const galleryPhotoTransition: SharedElementTransition = {
  zIndex: 2,
  renderer: function GalleryPhotoRenderer({
    progress,
    direction,
    source,
    target,
    zIndex,
  }: SharedElementTransitionRendererProps) {
    const isBackward = direction === 'backward';
    return (
      <StandInElement
        progress={progress}
        direction={direction}
        sourceMetrics={source.metrics}
        targetMetrics={target.metrics}
        sourceBorderRadius={isBackward ? 0 : theme.radius.lg}
        targetBorderRadius={isBackward ? theme.radius.lg : 0}
        zIndex={zIndex}
      >
        {source.content ?? target.content}
      </StandInElement>
    );
  },
};

export const galleryTitleTransition = textMorphTransition;
export const galleryLocationTransition: SharedElementTransition = {
  zIndex: 2,
  renderer: function GalleryLocationRenderer({
    progress,
    direction,
    source,
    target,
    zIndex,
  }: SharedElementTransitionRendererProps) {
    const sourceText = React.isValidElement<TextProps>(source.content)
      ? source.content
      : null;
    const targetText = React.isValidElement<TextProps>(target.content)
      ? target.content
      : null;
    const sourceStyle = StyleSheet.flatten(sourceText?.props.style);
    const targetStyle = StyleSheet.flatten(targetText?.props.style);
    const sourceFontSize = sourceStyle?.fontSize ?? 14;
    const targetFontSize = targetStyle?.fontSize ?? sourceFontSize;
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
    }));

    if (!sourceText || !targetText) return null;

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

// Glyph is rendered inside square wraps on both screens, so the stretch
// renderer's W/H interpolation naturally produces a *uniform* scale and the
// icon never squishes — even when the source tile is taller than the target
// hero (the tall tiles in the grid don't share an aspect ratio with the
// detail hero box).
export const galleryGlyphTransition = makeStretchTransition({
  singleContent: true,
});

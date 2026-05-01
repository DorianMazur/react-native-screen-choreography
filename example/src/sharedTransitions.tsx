import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import {
  StandInContainer,
  StandInCrossfade,
  StandInElement,
  resolveSurfaceStyle,
  type ElementMetrics,
  type SharedElementTransition,
  type SharedElementTransitionRendererProps,
} from 'react-native-screen-choreography';

interface MorphContentStandInProps {
  progress: SharedElementTransitionRendererProps['progress'];
  direction: SharedElementTransitionRendererProps['direction'];
  sourceMetrics: ElementMetrics;
  targetMetrics: ElementMetrics;
  sourceContent?: React.ReactNode;
  targetContent?: React.ReactNode;
  preserveAspectRatio?: boolean;
  zIndex?: number;
}

function MorphContentStandIn({
  progress,
  direction,
  sourceMetrics,
  targetMetrics,
  sourceContent,
  targetContent,
  preserveAspectRatio = false,
  zIndex = 1,
}: MorphContentStandInProps) {
  const carriedContent =
    direction === 'forward' ? sourceContent : targetContent;
  const baseMetrics = direction === 'forward' ? sourceMetrics : targetMetrics;

  const t = useDerivedValue(() => {
    return direction === 'backward' ? 1 - progress.value : progress.value;
  });

  const animatedStyle = useAnimatedStyle(() => {
    const currentWidth = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.width, targetMetrics.width],
      'clamp'
    );
    const currentHeight = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.height, targetMetrics.height],
      'clamp'
    );
    const currentCenterX = interpolate(
      t.value,
      [0, 1],
      [
        sourceMetrics.pageX + sourceMetrics.width / 2,
        targetMetrics.pageX + targetMetrics.width / 2,
      ],
      'clamp'
    );
    const currentCenterY = interpolate(
      t.value,
      [0, 1],
      [
        sourceMetrics.pageY + sourceMetrics.height / 2,
        targetMetrics.pageY + targetMetrics.height / 2,
      ],
      'clamp'
    );
    const baseCenterX = baseMetrics.pageX + baseMetrics.width / 2;
    const baseCenterY = baseMetrics.pageY + baseMetrics.height / 2;
    const widthScale =
      baseMetrics.width > 0 ? currentWidth / baseMetrics.width : 1;
    const heightScale =
      baseMetrics.height > 0 ? currentHeight / baseMetrics.height : 1;
    const scaleX = preserveAspectRatio ? heightScale : widthScale;
    const scaleY = heightScale;

    return {
      transform: [
        { translateX: currentCenterX - baseCenterX },
        { translateY: currentCenterY - baseCenterY },
        { scaleX },
        { scaleY },
      ],
    };
  });

  if (!carriedContent) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.morphContent,
        {
          left: baseMetrics.pageX,
          top: baseMetrics.pageY,
          width: baseMetrics.width,
          height: baseMetrics.height,
          zIndex,
        },
        animatedStyle,
      ]}
    >
      {carriedContent}
    </Animated.View>
  );
}

function TokenCardTransitionRenderer({
  progress,
  direction,
  source,
  target,
}: SharedElementTransitionRendererProps) {
  return (
    <StandInContainer
      progress={progress}
      direction={direction}
      sourceMetrics={source.metrics}
      targetMetrics={target.metrics}
      sourceStyle={resolveSurfaceStyle(source.style, {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
      })}
      targetStyle={resolveSurfaceStyle(target.style, {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
      })}
    />
  );
}

function TokenIconTransitionRenderer({
  progress,
  direction,
  source,
  target,
  zIndex,
}: SharedElementTransitionRendererProps) {
  return (
    <MorphContentStandIn
      progress={progress}
      direction={direction}
      sourceMetrics={source.metrics}
      targetMetrics={target.metrics}
      sourceContent={source.content}
      targetContent={target.content}
      preserveAspectRatio
      zIndex={zIndex}
    />
  );
}

function TokenTextTransitionRenderer({
  progress,
  direction,
  source,
  target,
  zIndex,
}: SharedElementTransitionRendererProps) {
  return (
    <StandInElement
      progress={progress}
      direction={direction}
      sourceMetrics={source.metrics}
      targetMetrics={target.metrics}
      sourceContent={source.content}
      targetContent={target.content}
      zIndex={zIndex}
    />
  );
}

function TokenValueTransitionRenderer({
  progress,
  direction,
  source,
  target,
  zIndex,
}: SharedElementTransitionRendererProps) {
  return (
    <StandInCrossfade
      progress={progress}
      direction={direction}
      sourceMetrics={source.metrics}
      targetMetrics={target.metrics}
      sourceContent={source.content}
      targetContent={target.content}
      fadeRange={[0.18, 0.58]}
      zIndex={zIndex}
    />
  );
}

export const tokenCardTransition: SharedElementTransition = {
  renderer: TokenCardTransitionRenderer,
  zIndex: 0,
};

export const tokenIconTransition: SharedElementTransition = {
  renderer: TokenIconTransitionRenderer,
  zIndex: 2,
};

export const tokenTextTransition: SharedElementTransition = {
  renderer: TokenTextTransitionRenderer,
  zIndex: 2,
};

export const tokenValueTransition: SharedElementTransition = {
  renderer: TokenValueTransitionRenderer,
  zIndex: 1,
};

const styles = StyleSheet.create({
  morphContent: {
    position: 'absolute',
    overflow: 'visible',
  },
});

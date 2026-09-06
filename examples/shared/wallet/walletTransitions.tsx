import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import type {
  ElementMetrics,
  SharedElementTransition,
  SharedElementTransitionRendererProps,
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
  arc = false,
}: SharedElementTransitionRendererProps & { arc?: boolean }) {
  const reduceMotion = useReducedMotion();
  const list = direction === 'forward' ? source : target;
  const detail = direction === 'forward' ? target : source;
  const listX = list.metrics.pageX;
  const listY = list.metrics.pageY;
  const listHeight = list.metrics.height;
  const detailX = detail.metrics.pageX;
  const detailY = detail.metrics.pageY;
  const detailWidth = detail.metrics.width;
  const detailHeight = detail.metrics.height;
  const detailContent = detail.content;
  const scaleFromHeight = detailHeight > 0 ? listHeight / detailHeight : 1;
  const animatedStyle = useAnimatedStyle(() => {
    const expansion = Math.max(0, Math.min(1, progress.value));
    const travel =
      arc && !reduceMotion
        ? expansion * expansion * (3 - 2 * expansion)
        : expansion;
    const lift =
      arc && !reduceMotion
        ? 4 *
          travel *
          (1 - travel) *
          Math.min(28, Math.abs(detailY - listY) * 0.15)
        : 0;
    return {
      transform: [
        {
          translateX: interpolate(
            travel,
            [0, 1],
            [0, detailX - listX],
            'clamp'
          ),
        },
        {
          translateY:
            interpolate(travel, [0, 1], [0, detailY - listY], 'clamp') - lift,
        },
        {
          scale: interpolate(travel, [0, 1], [scaleFromHeight, 1], 'clamp'),
        },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.textCarry,
        {
          left: listX,
          top: listY,
          width: detailWidth,
          height: detailHeight,
          zIndex,
        },
        animatedStyle,
      ]}
    >
      {detailContent}
    </Animated.View>
  );
}

function TokenValueTransitionRenderer(
  props: SharedElementTransitionRendererProps
) {
  return <TokenTextTransitionRenderer {...props} arc />;
}

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
  textCarry: {
    position: 'absolute',
    overflow: 'visible',
    transformOrigin: 'top left',
  },
});

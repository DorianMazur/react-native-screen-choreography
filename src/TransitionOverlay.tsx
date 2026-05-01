import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';
import type {
  TransitionSessionData,
  ElementTransitionPair,
  AnimationType,
} from './types';
import {
  StandInContainer,
  type BoxShadowEntry,
} from './standin/StandInContainer';
import { StandInElement } from './standin/StandInElement';
import { StandInCrossfade } from './standin/StandInCrossfade';

interface TransitionOverlayProps {
  session: TransitionSessionData | null;
  progress: SharedValue<number>;
  onReady?: () => void;
}

export function TransitionOverlay({
  session,
  progress,
  onReady,
}: TransitionOverlayProps) {
  React.useLayoutEffect(() => {
    if (session && session.pairs.length > 0) {
      onReady?.();
    }
  }, [onReady, session]);

  if (!session || session.pairs.length === 0) {
    return null;
  }

  // Sort pairs by z-index (containers first/back, then other elements on top)
  const sortedPairs = [...session.pairs].sort((a, b) => {
    const aZ = a.config.zIndex ?? getDefaultZIndex(a.config.animation);
    const bZ = b.config.zIndex ?? getDefaultZIndex(b.config.animation);
    return aZ - bZ;
  });

  return (
    <>
      <Animated.View style={styles.overlay} pointerEvents="none">
        {sortedPairs.map((pair) => (
          <StandInRenderer
            key={pair.id}
            pair={pair}
            progress={progress}
            direction={session.direction}
          />
        ))}
      </Animated.View>
    </>
  );
}

function parseBoxShadowFromStyle(
  flat: ViewStyle
): BoxShadowEntry[] | undefined {
  const bs = (flat as any).boxShadow;
  if (!bs) {
    return undefined;
  }

  // If it's already an array of objects, normalise each entry
  if (Array.isArray(bs)) {
    return bs.map((entry: any) => ({
      offsetX: typeof entry.offsetX === 'number' ? entry.offsetX : 0,
      offsetY: typeof entry.offsetY === 'number' ? entry.offsetY : 0,
      blurRadius: typeof entry.blurRadius === 'number' ? entry.blurRadius : 0,
      spreadDistance:
        typeof entry.spreadDistance === 'number' ? entry.spreadDistance : 0,
      color: typeof entry.color === 'string' ? entry.color : 'rgba(0,0,0,0)',
    }));
  }

  // String form — parse a single shorthand like "0px 4px 16px rgba(0,0,0,0.12)"
  if (typeof bs === 'string') {
    return parseBoxShadowString(bs);
  }

  return undefined;
}

function parseBoxShadowString(raw: string): BoxShadowEntry[] {
  // "0px 4px 16px rgba(0, 0, 0, 0.12)"
  const result: BoxShadowEntry[] = [];
  for (const part of raw.split(/,(?![^(]*\))/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // extract rgba/rgb color
    let color = 'rgba(0, 0, 0, 0.12)';
    const colorMatch = trimmed.match(/rgba?\([^)]+\)/i);
    if (colorMatch) {
      color = colorMatch[0];
    }
    // strip color and parse lengths
    const withoutColor = trimmed.replace(/rgba?\([^)]+\)/i, '').trim();
    const nums = withoutColor.split(/\s+/).map((v) => parseFloat(v) || 0);

    result.push({
      offsetX: nums[0] ?? 0,
      offsetY: nums[1] ?? 0,
      blurRadius: nums[2] ?? 0,
      spreadDistance: nums[3] ?? 0,
      color,
    });
  }
  return result.length > 0
    ? result
    : [
        {
          offsetX: 0,
          offsetY: 0,
          blurRadius: 0,
          spreadDistance: 0,
          color: 'rgba(0,0,0,0)',
        },
      ];
}

function resolveContainerStyle(
  style: ViewStyle | undefined,
  fallback: {
    backgroundColor: string;
    borderRadius: number;
  }
) {
  const flat = (StyleSheet.flatten(style) as ViewStyle | undefined) ?? {};

  return {
    backgroundColor:
      typeof flat.backgroundColor === 'string'
        ? flat.backgroundColor
        : fallback.backgroundColor,
    borderRadius:
      typeof flat.borderRadius === 'number'
        ? flat.borderRadius
        : fallback.borderRadius,
    boxShadow: parseBoxShadowFromStyle(flat),
  };
}

function getDefaultZIndex(animation?: AnimationType): number {
  switch (animation) {
    case 'morph':
      return 0;
    case 'move-resize':
      return 2;
    case 'crossfade':
      return 1;
    default:
      return 1;
  }
}

interface StandInRendererProps {
  pair: ElementTransitionPair;
  progress: SharedValue<number>;
  direction: TransitionSessionData['direction'];
}

function StandInRenderer({ pair, progress, direction }: StandInRendererProps) {
  const animation = pair.config.animation ?? 'move-resize';
  const sourceContainerStyle = resolveContainerStyle(pair.source.style, {
    backgroundColor: '#fff',
    borderRadius: 12,
  });
  const targetContainerStyle = resolveContainerStyle(pair.target.style, {
    backgroundColor: '#fff',
    borderRadius: 24,
  });

  switch (animation) {
    case 'morph':
      return (
        <StandInContainer
          progress={progress}
          direction={direction}
          sourceMetrics={pair.sourceMetrics}
          targetMetrics={pair.targetMetrics}
          sourceStyle={sourceContainerStyle}
          targetStyle={targetContainerStyle}
        >
          {pair.config.renderStandIn?.(progress)}
        </StandInContainer>
      );

    case 'move-resize':
      return (
        <StandInElement
          progress={progress}
          direction={direction}
          sourceMetrics={pair.sourceMetrics}
          targetMetrics={pair.targetMetrics}
          sourceContent={pair.source.renderContent?.()}
          targetContent={pair.target.renderContent?.()}
          zIndex={pair.config.zIndex ?? 2}
        >
          {pair.config.renderStandIn?.(progress)}
        </StandInElement>
      );

    case 'crossfade':
      return (
        <StandInCrossfade
          progress={progress}
          direction={direction}
          sourceMetrics={pair.sourceMetrics}
          targetMetrics={pair.targetMetrics}
          sourceContent={pair.source.renderContent?.()}
          targetContent={pair.target.renderContent?.()}
          zIndex={pair.config.zIndex ?? 1}
        />
      );

    case 'fade-in':
      return (
        <FadeInStandIn
          progress={progress}
          direction={direction}
          targetMetrics={pair.targetMetrics}
          content={pair.target.renderContent?.()}
        />
      );

    case 'fade-out':
      return (
        <FadeOutStandIn
          progress={progress}
          direction={direction}
          sourceMetrics={pair.sourceMetrics}
          content={pair.source.renderContent?.()}
        />
      );

    case 'none':
      return null;

    default:
      return (
        <StandInElement
          progress={progress}
          direction={direction}
          sourceMetrics={pair.sourceMetrics}
          targetMetrics={pair.targetMetrics}
          sourceContent={pair.source.renderContent?.()}
          targetContent={pair.target.renderContent?.()}
        >
          {pair.config.renderStandIn?.(progress)}
        </StandInElement>
      );
  }
}

function FadeInStandIn({
  progress,
  direction,
  targetMetrics,
  content,
}: {
  progress: SharedValue<number>;
  direction: TransitionSessionData['direction'];
  targetMetrics: ElementTransitionPair['targetMetrics'];
  content?: React.ReactNode;
}) {
  const fadeStyle = useAnimatedStyle(() => {
    const t = direction === 'backward' ? 1 - progress.value : progress.value;
    return { opacity: interpolate(t, [0.3, 0.7], [0, 1], 'clamp') };
  });

  const positionStyle = {
    position: 'absolute' as const,
    left: targetMetrics.pageX,
    top: targetMetrics.pageY,
    width: targetMetrics.width,
    height: targetMetrics.height,
  };

  return (
    <Animated.View style={[positionStyle, fadeStyle]}>{content}</Animated.View>
  );
}

function FadeOutStandIn({
  progress,
  direction,
  sourceMetrics,
  content,
}: {
  progress: SharedValue<number>;
  direction: TransitionSessionData['direction'];
  sourceMetrics: ElementTransitionPair['sourceMetrics'];
  content?: React.ReactNode;
}) {
  const fadeStyle = useAnimatedStyle(() => {
    const t = direction === 'backward' ? 1 - progress.value : progress.value;
    return { opacity: interpolate(t, [0, 0.5], [1, 0], 'clamp') };
  });

  const positionStyle = {
    position: 'absolute' as const,
    left: sourceMetrics.pageX,
    top: sourceMetrics.pageY,
    width: sourceMetrics.width,
    height: sourceMetrics.height,
  };

  return (
    <Animated.View style={[positionStyle, fadeStyle]}>{content}</Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
});

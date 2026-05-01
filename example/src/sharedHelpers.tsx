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

/**
 * Generic morph: carries the source content from its source bounds to the
 * target bounds via translate + scale.
 */
export function MorphContent({
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

  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );

  const animatedStyle = useAnimatedStyle(() => {
    const w = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.width, targetMetrics.width],
      'clamp'
    );
    const h = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.height, targetMetrics.height],
      'clamp'
    );
    const cx = interpolate(
      t.value,
      [0, 1],
      [
        sourceMetrics.pageX + sourceMetrics.width / 2,
        targetMetrics.pageX + targetMetrics.width / 2,
      ],
      'clamp'
    );
    const cy = interpolate(
      t.value,
      [0, 1],
      [
        sourceMetrics.pageY + sourceMetrics.height / 2,
        targetMetrics.pageY + targetMetrics.height / 2,
      ],
      'clamp'
    );
    const baseCx = baseMetrics.pageX + baseMetrics.width / 2;
    const baseCy = baseMetrics.pageY + baseMetrics.height / 2;
    const scaleW = baseMetrics.width > 0 ? w / baseMetrics.width : 1;
    const scaleH = baseMetrics.height > 0 ? h / baseMetrics.height : 1;
    return {
      transform: [
        { translateX: cx - baseCx },
        { translateY: cy - baseCy },
        { scaleX: preserveAspectRatio ? scaleH : scaleW },
        { scaleY: scaleH },
      ],
    };
  });

  if (!carriedContent) return null;

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

/**
 * Opaque surface morph (background, border-radius, shadow).
 *
 * `sourceFallback` should describe the *origin* (list-side) surface and
 * `targetFallback` the *destination* (detail-side) surface. The renderer
 * detects the active session's direction and swaps them automatically when
 * playing a backward session, so the radii/colors always interpolate from
 * list → detail visually regardless of navigation direction.
 */
export function makeSurfaceTransition(
  sourceFallback: { backgroundColor?: string; borderRadius?: number },
  targetFallback: { backgroundColor?: string; borderRadius?: number }
): SharedElementTransition {
  return {
    zIndex: 0,
    renderer: function SurfaceTransition({
      progress,
      direction,
      source,
      target,
    }: SharedElementTransitionRendererProps) {
      const isBackward = direction === 'backward';
      const srcFb = isBackward ? targetFallback : sourceFallback;
      const tgtFb = isBackward ? sourceFallback : targetFallback;
      return (
        <StandInContainer
          progress={progress}
          direction={direction}
          sourceMetrics={source.metrics}
          targetMetrics={target.metrics}
          sourceStyle={resolveSurfaceStyle(source.style, srcFb)}
          targetStyle={resolveSurfaceStyle(target.style, tgtFb)}
        />
      );
    },
  };
}

/** Crossfading text content morph (carries source content, fades into target). */
export const crossfadeTransition: SharedElementTransition = {
  zIndex: 2,
  renderer: function CrossfadeRenderer({
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
  },
};

/** Element morph that scales source content's dimensions into target's. */
export const stretchTransition: SharedElementTransition =
  makeStretchTransition();

/**
 * Like {@link stretchTransition} but with explicit list-side / detail-side
 * border radii so the overlay clips with rounded corners that morph in
 * lockstep with the surface underneath. The renderer swaps source/target
 * automatically when the active session is backward so the radii always
 * interpolate from list-side → detail-side visually.
 *
 * Set `singleContent: true` to render only the *larger* of the two contents
 * (scaled to fit) instead of crossfading source↔target. This avoids the
 * "two icons / two text copies" artifact when the same logical content
 * appears at two sizes in source and target.
 */
export function makeStretchTransition(
  options: {
    /** Border radius on the originating (list-side) surface. */
    sourceBorderRadius?: number;
    /** Border radius on the destination (detail-side) surface. */
    targetBorderRadius?: number;
    fadeRange?: [number, number];
    zIndex?: number;
    /**
     * When true, only the larger of the two contents is carried (scaled to
     * fit) and no opacity crossfade runs. Use for content that's the same
     * in both screens but rendered at different sizes (icons, glyphs).
     */
    singleContent?: boolean;
  } = {}
): SharedElementTransition {
  const {
    sourceBorderRadius,
    targetBorderRadius,
    fadeRange,
    zIndex = 2,
    singleContent = false,
  } = options;
  return {
    zIndex,
    renderer: function StretchRenderer({
      progress,
      direction,
      source,
      target,
      zIndex: rendererZ,
    }: SharedElementTransitionRendererProps) {
      const isBackward = direction === 'backward';
      const srcR = isBackward ? targetBorderRadius : sourceBorderRadius;
      const tgtR = isBackward ? sourceBorderRadius : targetBorderRadius;

      if (singleContent) {
        return (
          <SingleContentStretch
            progress={progress}
            direction={direction}
            sourceMetrics={source.metrics}
            targetMetrics={target.metrics}
            sourceContent={source.content}
            targetContent={target.content}
            sourceBorderRadius={srcR}
            targetBorderRadius={tgtR}
            zIndex={rendererZ}
          />
        );
      }

      return (
        <StandInElement
          progress={progress}
          direction={direction}
          sourceMetrics={source.metrics}
          targetMetrics={target.metrics}
          sourceContent={source.content}
          targetContent={target.content}
          sourceBorderRadius={srcR}
          targetBorderRadius={tgtR}
          fadeRange={fadeRange}
          zIndex={rendererZ}
        />
      );
    },
  };
}

interface SingleContentStretchProps {
  progress: SharedElementTransitionRendererProps['progress'];
  direction: SharedElementTransitionRendererProps['direction'];
  sourceMetrics: ElementMetrics;
  targetMetrics: ElementMetrics;
  sourceContent?: React.ReactNode;
  targetContent?: React.ReactNode;
  sourceBorderRadius?: number;
  targetBorderRadius?: number;
  zIndex?: number;
}

/**
 * Top-left anchored stretch that always carries the *destination* content
 * (the side the session is landing on), so the endpoint is at scale=1 and
 * always renders identically to the real target element. Mid-flight on the
 * leg where the destination is smaller than the source, the carried content
 * is briefly upscaled, but the *landings* are pixel-exact in both
 * directions — no pop when the overlay hands off to the real element.
 */
function SingleContentStretch({
  progress,
  direction,
  sourceMetrics,
  targetMetrics,
  sourceContent,
  targetContent,
  sourceBorderRadius,
  targetBorderRadius,
  zIndex = 2,
}: SingleContentStretchProps) {
  // Always carry the *target* (landing) content. At t=1, scale resolves to
  // exactly 1, position matches targetMetrics, and the overlay’s rendering
  // is identical to the real destination element — seamless handoff in
  // both forward and backward directions.
  const carried = targetContent ?? sourceContent;
  const base = targetMetrics;

  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );

  const hasRadius =
    sourceBorderRadius !== undefined || targetBorderRadius !== undefined;
  const sR = sourceBorderRadius ?? 0;
  const tR = targetBorderRadius ?? 0;

  const containerStyle = useAnimatedStyle(() => {
    const x = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.pageX, targetMetrics.pageX],
      'clamp'
    );
    const y = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.pageY, targetMetrics.pageY],
      'clamp'
    );
    const w = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.width, targetMetrics.width],
      'clamp'
    );
    const h = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.height, targetMetrics.height],
      'clamp'
    );
    const radius = hasRadius
      ? interpolate(t.value, [0, 1], [sR, tR], 'clamp')
      : 0;
    return {
      left: x,
      top: y,
      width: w,
      height: h,
      ...(hasRadius ? { borderRadius: radius } : {}),
    };
  });

  const innerStyle = useAnimatedStyle(() => {
    const w = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.width, targetMetrics.width],
      'clamp'
    );
    const h = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.height, targetMetrics.height],
      'clamp'
    );
    const sx = base.width > 0 ? w / base.width : 1;
    const sy = base.height > 0 ? h / base.height : 1;
    return {
      transform: [{ scaleX: sx }, { scaleY: sy }],
    };
  });

  if (!carried) return null;

  return (
    <Animated.View
      style={[styles.singleContentOuter, { zIndex }, containerStyle]}
    >
      <Animated.View
        style={[
          styles.singleContentInner,
          { width: base.width, height: base.height },
          innerStyle,
        ]}
      >
        {carried}
      </Animated.View>
    </Animated.View>
  );
}

/** Aspect-ratio-preserving morph for square/round artwork. */
export const aspectMorphTransition: SharedElementTransition = {
  zIndex: 2,
  renderer: function AspectMorphRenderer({
    progress,
    direction,
    source,
    target,
    zIndex,
  }: SharedElementTransitionRendererProps) {
    return (
      <MorphContent
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
  },
};

interface TextMorphProps {
  progress: SharedElementTransitionRendererProps['progress'];
  direction: SharedElementTransitionRendererProps['direction'];
  sourceMetrics: ElementMetrics;
  targetMetrics: ElementMetrics;
  sourceContent?: React.ReactNode;
  targetContent?: React.ReactNode;
  zIndex?: number;
}

/**
 * Top-left anchored morph for text that's identical in source and target
 * but rendered at different sizes. Carries the *destination* content so
 * the landing is always at scale=1 and pixel-matches the real target text
 * — no pop on either forward or backward navigation.
 */
function TextMorph({
  progress,
  direction,
  sourceMetrics,
  targetMetrics,
  sourceContent,
  targetContent,
  zIndex = 2,
}: TextMorphProps) {
  // Carry the target (landing) content. At t=1, scale=1 and position equals
  // targetMetrics — the carried text renders identically to the real text
  // it hands off to. Mid-flight may briefly upscale (blurry for ~half a
  // session on the leg where the target is the smaller side) but both
  // endpoints are crisp.
  const carried = targetContent ?? sourceContent;
  const base = targetMetrics;
  const t = useDerivedValue(() =>
    direction === 'backward' ? 1 - progress.value : progress.value
  );

  const animated = useAnimatedStyle(() => {
    const x = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.pageX, targetMetrics.pageX],
      'clamp'
    );
    const y = interpolate(
      t.value,
      [0, 1],
      [sourceMetrics.pageY, targetMetrics.pageY],
      'clamp'
    );
    const startScale = base.height > 0 ? sourceMetrics.height / base.height : 1;
    const endScale = base.height > 0 ? targetMetrics.height / base.height : 1;
    const scale = interpolate(t.value, [0, 1], [startScale, endScale], 'clamp');
    return {
      left: x,
      top: y,
      transform: [{ scale }],
    };
  });

  if (!carried) return null;

  return (
    <Animated.View
      style={[
        styles.textMorph,
        { width: base.width, height: base.height, zIndex },
        animated,
      ]}
    >
      {carried}
    </Animated.View>
  );
}

/**
 * Smooth morph for text whose content is the same in both screens but the
 * font size changes. Single element, no crossfade artifact.
 */
export const textMorphTransition: SharedElementTransition = {
  zIndex: 2,
  renderer: function TextMorphRenderer({
    progress,
    direction,
    source,
    target,
    zIndex,
  }: SharedElementTransitionRendererProps) {
    return (
      <TextMorph
        progress={progress}
        direction={direction}
        sourceMetrics={source.metrics}
        targetMetrics={target.metrics}
        sourceContent={source.content}
        targetContent={target.content}
        zIndex={zIndex}
      />
    );
  },
};

const styles = StyleSheet.create({
  morphContent: {
    position: 'absolute',
    overflow: 'hidden',
  },
  singleContentOuter: {
    position: 'absolute',
    overflow: 'hidden',
  },
  singleContentInner: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
  textMorph: {
    position: 'absolute',
    transformOrigin: 'top left',
  },
});

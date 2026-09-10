import React from 'react';
import { usePresentationReady } from '../core/PresentationReadiness';
import {
  Image,
  Text,
  type TextProps,
  StyleSheet,
  View,
  type ImageProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type {
  SharedElementTransitionRenderer,
  SharedElementTransitionRendererProps,
  SharedElementTransitionSide,
} from '../types';
import { resolveSurfaceStyle } from '../standin/resolveSurfaceStyle';
import {
  fittedScale,
  followedPosition,
  frameAt,
  mix,
  resolveFollowAnchor,
  sampleTrack,
  type OpacityTrack,
  type ProgressRange,
  type TransitionAnchor,
} from './declarativeGeometry';

export type { OpacityTrack, ProgressRange } from './declarativeGeometry';

interface RecipeOptions {
  zIndex?: number;
}
export interface SurfaceOptions extends RecipeOptions {
  radius?: readonly [number, number];
  shadow?: 'endpoints' | 'collapsed';
  opacity?: OpacityTrack;
  backdrop?: { content: React.ReactNode; opacity: OpacityTrack };
}
export interface ImageOptions extends RecipeOptions {
  mode?: 'morph' | 'crossfade';
  overlay?: React.ReactNode;
  fit?: 'cover';
  radius?: readonly [number, number];
}
export interface TextOptions extends RecipeOptions {
  /** Scale one identical single-line label, or blend fixed layouts (default). */
  mode?: 'scale-crossfade' | 'scale';
}
export interface CrossfadeOptions extends RecipeOptions {
  exitDuring?: ProgressRange;
  enterDuring?: ProgressRange;
}
export interface FadeOptions extends RecipeOptions {
  during?: ProgressRange;
  follow?: string | readonly string[];
}
export interface SurfaceRecipe extends SurfaceOptions {
  readonly kind: 'surface';
}
export interface ImageRecipe extends ImageOptions {
  readonly kind: 'image';
}
export interface TextRecipe extends TextOptions {
  readonly kind: 'text';
}
export interface CrossfadeRecipe extends CrossfadeOptions {
  readonly kind: 'crossfade';
}
export interface FadeRecipe extends FadeOptions {
  readonly kind: 'fade';
}
export type SharedRecipe =
  | SurfaceRecipe
  | ImageRecipe
  | TextRecipe
  | CrossfadeRecipe;

const DEFAULT_RANGE: ProgressRange = [0.3, 0.65];
const FULL_OPACITY: OpacityTrack = { input: [0, 1], output: [1, 1] };

function checkedRange(range: ProgressRange): ProgressRange {
  if (
    range.length !== 2 ||
    !range.every(Number.isFinite) ||
    range[0] < 0 ||
    range[1] > 1 ||
    range[0] >= range[1]
  ) {
    throw new Error(
      'Transition ranges must contain two increasing progress values between 0 and 1.'
    );
  }
  return Object.freeze([...range]) as ProgressRange;
}
function checkedTrack(track: OpacityTrack): OpacityTrack {
  if (
    track.input.length < 2 ||
    track.input.length !== track.output.length ||
    !track.input.every(
      (value, index) =>
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 1 &&
        (index === 0 || value > track.input[index - 1]!)
    ) ||
    !track.output.every(
      (value) => Number.isFinite(value) && value >= 0 && value <= 1
    )
  ) {
    throw new Error(
      'Opacity tracks require matching arrays, increasing progress inputs, and values between 0 and 1.'
    );
  }
  return Object.freeze({
    input: Object.freeze([...track.input]),
    output: Object.freeze([...track.output]),
  });
}
function checkedRadius(radius: readonly [number, number] | undefined) {
  if (
    radius &&
    (radius.length !== 2 ||
      !radius.every((value) => Number.isFinite(value) && value >= 0))
  ) {
    throw new Error(
      'Transition radius requires two finite nonnegative endpoint values.'
    );
  }
  return radius
    ? (Object.freeze([...radius]) as readonly [number, number])
    : undefined;
}
function checkedZIndex(zIndex: number | undefined) {
  if (zIndex !== undefined && !Number.isFinite(zIndex))
    throw new Error('Transition zIndex must be finite.');
  return zIndex;
}

export function surface(options: SurfaceOptions = {}): SurfaceRecipe {
  return Object.freeze({
    ...options,
    kind: 'surface',
    zIndex: checkedZIndex(options.zIndex),
    radius: checkedRadius(options.radius),
    shadow: options.shadow ?? 'endpoints',
    opacity: options.opacity ? checkedTrack(options.opacity) : FULL_OPACITY,
    backdrop: options.backdrop
      ? Object.freeze({
          content: options.backdrop.content,
          opacity: checkedTrack(options.backdrop.opacity),
        })
      : undefined,
  });
}
export function image(options: ImageOptions = {}): ImageRecipe {
  if (
    options.mode &&
    options.mode !== 'morph' &&
    options.mode !== 'crossfade'
  ) {
    throw new Error('image mode must be morph or crossfade.');
  }
  return Object.freeze({
    ...options,
    kind: 'image',
    fit: 'cover',
    zIndex: checkedZIndex(options.zIndex),
    radius: checkedRadius(options.radius),
  });
}
export function text(options: TextOptions = {}): TextRecipe {
  return Object.freeze({
    ...options,
    kind: 'text',
    mode: options.mode ?? 'scale-crossfade',
    zIndex: checkedZIndex(options.zIndex),
  });
}
export function crossfade(options: CrossfadeOptions = {}): CrossfadeRecipe {
  return Object.freeze({
    ...options,
    kind: 'crossfade',
    zIndex: checkedZIndex(options.zIndex),
    exitDuring: checkedRange(options.exitDuring ?? DEFAULT_RANGE),
    enterDuring: checkedRange(options.enterDuring ?? DEFAULT_RANGE),
  });
}
export function fade(options: FadeOptions = {}): FadeRecipe {
  return Object.freeze({
    ...options,
    kind: 'fade',
    zIndex: checkedZIndex(options.zIndex),
    during: checkedRange(options.during ?? DEFAULT_RANGE),
    follow: Array.isArray(options.follow)
      ? Object.freeze([...options.follow])
      : options.follow,
  });
}

interface Endpoints {
  collapsed: SharedElementTransitionSide;
  expanded: SharedElementTransitionSide;
  anchor: TransitionAnchor;
}
function endpoints(props: SharedElementTransitionRendererProps): Endpoints {
  const collapsed =
    props.direction === 'backward' ? props.target : props.source;
  const expanded = props.direction === 'backward' ? props.source : props.target;
  // These objects contain geometry only: never capture endpoint React content in a worklet.
  return {
    collapsed,
    expanded,
    anchor: {
      collapsed: { ...collapsed.metrics },
      expanded: { ...expanded.metrics },
    },
  };
}
function opacityTrack(range: ProgressRange, entering: boolean): OpacityTrack {
  return { input: range, output: entering ? [0, 1] : [1, 0] };
}

// Metrics already include the wrapper's outer placement and dimensions.
// Reapply only its internal layout and paint so children keep their endpoint
// positions (notably padded text) without duplicating margins or flex sizing.
function fixedEndpointStyle(style: ViewStyle | undefined): ViewStyle {
  if (!style) return {};
  return Object.fromEntries(
    Object.entries(style).filter(
      ([key]) =>
        key.startsWith('padding') ||
        key.startsWith('border') ||
        [
          'backgroundColor',
          'experimental_backgroundImage',
          'boxShadow',
          'overflow',
          'flexDirection',
          'flexWrap',
          'alignItems',
          'alignContent',
          'justifyContent',
          'gap',
          'rowGap',
          'columnGap',
          'direction',
          'boxSizing',
        ].includes(key)
    )
  ) as ViewStyle;
}

interface FixedLayerProps {
  side: SharedElementTransitionSide;
  anchor: TransitionAnchor;
  progress: SharedElementTransitionRendererProps['progress'];
  opacity: OpacityTrack;
  fit?: 'cover' | 'contain';
  local?: boolean;
}
function FixedLayer({
  side,
  anchor,
  progress,
  opacity,
  fit = 'contain',
  local = false,
}: FixedLayerProps) {
  const base = { ...side.metrics };
  const style = useAnimatedStyle(() => {
    const frame = frameAt(anchor, progress.value);
    const scale = fittedScale(base, frame, fit);
    return {
      opacity: sampleTrack(progress.value, opacity),
      transform: [
        {
          translateX: local
            ? (frame.width - base.width * scale) / 2
            : frame.pageX,
        },
        {
          translateY: local
            ? (frame.height - base.height * scale) / 2
            : frame.pageY,
        },
        { scale },
      ],
    };
  });
  if (side.present === false || side.content == null) return null;
  return (
    <Animated.View
      style={[
        fixedEndpointStyle(side.style),
        styles.fixed,
        { width: base.width, height: base.height },
        style,
      ]}
    >
      {side.content}
    </Animated.View>
  );
}

function readScaleText(side: SharedElementTransitionSide) {
  const content = side.content;
  if (
    !React.isValidElement<TextProps>(content) ||
    content.type !== Text ||
    content.props.numberOfLines !== 1 ||
    React.Children.toArray(content.props.children).some(
      (child) => typeof child !== 'string' && typeof child !== 'number'
    )
  ) {
    throw new Error(
      'text({ mode: "scale" }) requires a direct, plain Text child with numberOfLines={1}.'
    );
  }
  const style = StyleSheet.flatten(content.props.style);
  const fontSize = style?.fontSize;
  if (
    typeof fontSize !== 'number' ||
    !Number.isFinite(fontSize) ||
    fontSize <= 0
  ) {
    throw new Error(
      'Scale text requires explicit positive fontSize values at both endpoints.'
    );
  }
  return {
    content,
    style,
    fontSize,
    label: React.Children.toArray(content.props.children).join(''),
  };
}

function ScaledText(props: SharedElementTransitionRendererProps) {
  const { collapsed, expanded, anchor } = endpoints(props);
  const first = readScaleText(collapsed);
  const last = readScaleText(expanded);
  if (
    first.label !== last.label ||
    ['fontFamily', 'fontWeight', 'fontStyle', 'color'].some(
      (key) =>
        first.style?.[key as keyof typeof first.style] !==
        last.style?.[key as keyof typeof last.style]
    )
  ) {
    throw new Error(
      'Scale text requires identical text, font family, weight, style, and color.'
    );
  }
  const sourceScale = first.fontSize / last.fontSize;
  const { progress } = props;
  const motion = useAnimatedStyle(() => {
    const frame = frameAt(anchor, progress.value);
    return {
      transform: [
        { translateX: frame.pageX },
        { translateY: frame.pageY },
        { scale: mix(sourceScale, 1, progress.value) },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.fixed,
        {
          width: expanded.metrics.width,
          height: expanded.metrics.height,
          zIndex: props.zIndex,
        },
        motion,
      ]}
    >
      {last.content}
    </Animated.View>
  );
}

function readMorphImage(side: SharedElementTransitionSide) {
  const content = side.content;
  if (!React.isValidElement<ImageProps>(content) || content.type !== Image) {
    throw new Error(
      'image({ mode: "morph" }) requires a direct Image child at both endpoints.'
    );
  }
  const source = content.props.source;
  const asset = source ? Image.resolveAssetSource(source) : null;
  const width = asset?.width;
  const height = asset?.height;
  if (
    !asset ||
    !source ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      'Morph images require a source with known width and height.'
    );
  }
  if (content.props.resizeMode && content.props.resizeMode !== 'cover') {
    throw new Error('Morph image endpoints must use resizeMode="cover".');
  }
  return { source, asset: { ...asset, width, height } };
}

function MorphImage({
  recipe,
  ...props
}: SharedElementTransitionRendererProps & { recipe: ImageRecipe }) {
  const { collapsed, expanded, anchor } = endpoints(props);
  const first = readMorphImage(collapsed);
  const last = readMorphImage(expanded);
  if (
    first.asset.uri !== last.asset.uri ||
    first.asset.width !== last.asset.width ||
    first.asset.height !== last.asset.height
  ) {
    throw new Error('Morph image endpoints must use the same image source.');
  }
  const [loaded, setLoaded] = React.useState(false);
  usePresentationReady(loaded);
  const radius = recipe.radius ?? [
    resolveSurfaceStyle(collapsed.style).borderRadius ?? 0,
    resolveSurfaceStyle(expanded.style).borderRadius ?? 0,
  ];
  const { progress } = props;
  const clip = useAnimatedStyle(() => {
    const frame = frameAt(anchor, progress.value);
    return {
      left: frame.pageX,
      top: frame.pageY,
      width: frame.width,
      height: frame.height,
      borderRadius: mix(radius[0]!, radius[1]!, progress.value),
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.clip, { zIndex: props.zIndex }, clip]}
    >
      <Image
        source={first.source}
        onLoad={() => setLoaded(true)}
        resizeMode="cover"
        fadeDuration={0}
        style={StyleSheet.absoluteFill}
      />
      {recipe.overlay}
    </Animated.View>
  );
}

function SharedContent({
  recipe,
  ...props
}: SharedElementTransitionRendererProps & {
  recipe: Exclude<SharedRecipe, SurfaceRecipe>;
}) {
  const { collapsed, expanded, anchor } = endpoints(props);
  const imageRecipe = recipe.kind === 'image';
  const rangeOut =
    recipe.kind === 'crossfade'
      ? (recipe.exitDuring ?? DEFAULT_RANGE)
      : DEFAULT_RANGE;
  const rangeIn =
    recipe.kind === 'crossfade'
      ? (recipe.enterDuring ?? DEFAULT_RANGE)
      : DEFAULT_RANGE;
  const sourceRadius = resolveSurfaceStyle(collapsed.style).borderRadius ?? 0;
  const targetRadius = resolveSurfaceStyle(expanded.style).borderRadius ?? 0;
  const radius = imageRecipe
    ? (recipe.radius ?? [sourceRadius, targetRadius])
    : [0, 0];
  const { progress } = props;
  const clipStyle = useAnimatedStyle(() => {
    if (!imageRecipe) return {};
    const frame = frameAt(anchor, progress.value);
    return {
      width: frame.width,
      height: frame.height,
      borderRadius: mix(radius[0]!, radius[1]!, progress.value),
      transform: [{ translateX: frame.pageX }, { translateY: frame.pageY }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        imageRecipe ? styles.clip : styles.fill,
        { zIndex: props.zIndex },
        clipStyle,
      ]}
    >
      <FixedLayer
        side={collapsed}
        anchor={anchor}
        progress={progress}
        // Keep opaque image coverage while the upper endpoint crop fades in.
        // Fading both layers exposes the background in the middle of the blend.
        opacity={imageRecipe ? FULL_OPACITY : opacityTrack(rangeOut, false)}
        fit={imageRecipe ? 'cover' : 'contain'}
        local={imageRecipe}
      />
      <FixedLayer
        side={expanded}
        anchor={anchor}
        progress={progress}
        opacity={opacityTrack(rangeIn, true)}
        fit={imageRecipe ? 'cover' : 'contain'}
        local={imageRecipe}
      />
      {imageRecipe && recipe.overlay}
    </Animated.View>
  );
}

function SurfaceContent({
  recipe,
  ...props
}: SharedElementTransitionRendererProps & { recipe: SurfaceRecipe }) {
  const { collapsed, expanded, anchor } = endpoints(props);
  const collapsedStyle = resolveSurfaceStyle(collapsed.style);
  const expandedStyle = resolveSurfaceStyle(expanded.style);
  const sourceColor = collapsedStyle.backgroundColor ?? 'transparent';
  const targetColor = expandedStyle.backgroundColor ?? 'transparent';
  const radius = recipe.radius ?? [
    collapsedStyle.borderRadius ?? 0,
    expandedStyle.borderRadius ?? 0,
  ];
  const opacity = recipe.opacity ?? FULL_OPACITY;
  const collapsedShadowOnly = recipe.shadow === 'collapsed';
  const { progress } = props;
  const frameStyle = useAnimatedStyle(() => {
    const frame = frameAt(anchor, progress.value);
    return {
      width: frame.width,
      height: frame.height,
      transform: [{ translateX: frame.pageX }, { translateY: frame.pageY }],
    };
  });
  const shapeStyle = useAnimatedStyle(() => ({
    borderRadius: mix(radius[0]!, radius[1]!, progress.value),
  }));
  const colorStyle = useAnimatedStyle(() => ({
    opacity: sampleTrack(progress.value, opacity),
    backgroundColor:
      sourceColor === targetColor
        ? sourceColor
        : interpolateColor(
            Math.max(0, Math.min(1, progress.value)),
            [0, 1],
            [sourceColor, targetColor]
          ),
  }));
  const sourceShadow = useAnimatedStyle(() => ({
    opacity:
      sampleTrack(progress.value, opacity) *
      (collapsedShadowOnly ? 1 : mix(1, 0, progress.value)),
  }));
  const targetShadow = useAnimatedStyle(() => ({
    opacity: sampleTrack(progress.value, opacity) * mix(0, 1, progress.value),
  }));
  return (
    <View pointerEvents="none" style={[styles.fill, { zIndex: props.zIndex }]}>
      {recipe.backdrop && (
        <SurfaceBackdrop backdrop={recipe.backdrop} progress={progress} />
      )}
      <Animated.View style={[styles.fixed, frameStyle]}>
        {collapsedStyle.boxShadow && (
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: sourceColor,
                boxShadow: collapsedStyle.boxShadow,
              },
              shapeStyle,
              sourceShadow,
            ]}
          />
        )}
        {!collapsedShadowOnly && expandedStyle.boxShadow && (
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: targetColor,
                boxShadow: expandedStyle.boxShadow,
              },
              shapeStyle,
              targetShadow,
            ]}
          />
        )}
        <Animated.View style={[styles.fill, styles.overflowHidden, shapeStyle]}>
          <Animated.View style={[styles.fill, colorStyle]} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function SurfaceBackdrop({
  backdrop,
  progress,
}: {
  backdrop: NonNullable<SurfaceRecipe['backdrop']>;
  progress: SharedElementTransitionRendererProps['progress'];
}) {
  const opacity = backdrop.opacity;
  const style = useAnimatedStyle(() => ({
    opacity: sampleTrack(progress.value, opacity),
  }));
  return (
    <Animated.View style={[styles.fill, style]}>
      {backdrop.content}
    </Animated.View>
  );
}

function FadedEndpoint({
  recipe,
  endpoint,
  ...props
}: SharedElementTransitionRendererProps & {
  recipe: FadeRecipe;
  endpoint: 'collapsed' | 'expanded';
}) {
  const side = endpoints(props)[endpoint];
  const base = { ...side.metrics };
  const anchor = resolveFollowAnchor(recipe.follow, props.anchors);
  const opacity = opacityTrack(
    recipe.during ?? DEFAULT_RANGE,
    endpoint === 'expanded'
  );
  const { progress } = props;
  const style = useAnimatedStyle(() => {
    const position = followedPosition(base, anchor, endpoint, progress.value);
    return {
      opacity: sampleTrack(progress.value, opacity),
      transform: [{ translateX: position.x }, { translateY: position.y }],
    };
  });
  if (side.present === false || side.content == null) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        fixedEndpointStyle(side.style),
        styles.fixed,
        {
          width: base.width,
          height: base.height,
          zIndex: recipe.zIndex ?? props.zIndex,
        },
        style,
      ]}
    >
      {side.content}
    </Animated.View>
  );
}

/** Compile once; per-frame worklets capture only numeric geometry, colors and tracks. */
export function createDeclarativeRenderer(config: {
  shared?: SharedRecipe;
  enter?: FadeRecipe;
  exit?: FadeRecipe;
}): SharedElementTransitionRenderer {
  function DeclarativeRenderer(props: SharedElementTransitionRendererProps) {
    if (config.shared) {
      return config.shared.kind === 'surface' ? (
        <SurfaceContent {...props} recipe={config.shared} />
      ) : config.shared.kind === 'image' && config.shared.mode === 'morph' ? (
        <MorphImage {...props} recipe={config.shared} />
      ) : config.shared.kind === 'text' && config.shared.mode === 'scale' ? (
        <ScaledText {...props} />
      ) : (
        <SharedContent {...props} recipe={config.shared} />
      );
    }
    return (
      <View pointerEvents="none" style={styles.fill}>
        {config.exit && (
          <FadedEndpoint {...props} recipe={config.exit} endpoint="collapsed" />
        )}
        {config.enter && (
          <FadedEndpoint {...props} recipe={config.enter} endpoint="expanded" />
        )}
      </View>
    );
  }
  return DeclarativeRenderer;
}

const styles = StyleSheet.create({
  fixed: { position: 'absolute', left: 0, top: 0, transformOrigin: 'top left' },
  fill: { ...StyleSheet.absoluteFill },
  clip: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    transformOrigin: 'top left',
  },
  overflowHidden: { overflow: 'hidden' },
});

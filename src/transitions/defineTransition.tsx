import type { ComponentType, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import {
  SharedElement,
  type SharedElementProps,
  type SharedElementTargetProps,
} from '../components/SharedElement';
import { useChoreographyProgress } from '../hooks/useChoreographyProgress';
import { TransitionFrame } from '../standin/TransitionFrame';
import { TransitionSurface } from '../standin/TransitionSurface';
import { resolveSurfaceStyle } from '../standin/resolveSurfaceStyle';
import type {
  ChoreographyNavigationOptions,
  Transition,
  TransitionRendererProps,
} from '../types';
import { makeTransition } from './makeTransition';

type Motion = Pick<ChoreographyNavigationOptions, 'spring' | 'duration'>;
export interface SharedMotionRecipe {
  kind: 'bounds' | 'surface';
  /** Canonical collapsed/expanded corner radii. Omit to use endpoint styles. */
  radius?: readonly [number, number];
  zIndex?: number;
}
export interface RevealRecipe {
  /** Expansion-progress interval, increasing from 0 to 1. */
  during?: readonly [number, number];
  /** Offset while hidden; the visible endpoint always has zero offset. */
  translateY?: number;
}
type SharedRecipes = Record<string, SharedMotionRecipe | Transition>;
type RevealRecipes = Record<string, RevealRecipe>;
export interface TransitionDefinition<
  Shared extends SharedRecipes = SharedRecipes,
  Enter extends RevealRecipes = RevealRecipes,
  Exit extends RevealRecipes = RevealRecipes,
> {
  motion?: Motion;
  shared?: Shared;
  enter?: Enter;
  exit?: Exit;
}
export type TransitionElementProps<Name extends string = string> = Omit<
  SharedElementProps,
  'id' | 'transition'
> & { name: Name };
export type TransitionTargetProps<Name extends string = string> = Omit<
  SharedElementTargetProps,
  'id' | 'transition'
> & { name: Name };
export interface TransitionRevealProps<Name extends string = string> {
  name: Name;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}
export interface DefinedTransition<
  Shared extends string,
  Enter extends string,
  Exit extends string,
> {
  Element: ComponentType<TransitionElementProps<Shared>> & {
    Target: ComponentType<TransitionTargetProps<Shared>>;
  };
  Enter: ComponentType<TransitionRevealProps<Enter>>;
  Exit: ComponentType<TransitionRevealProps<Exit>>;
  /** Spread into forward/Back navigation options to request the same motion. */
  navigationOptions: Readonly<Motion>;
}

function checkedRange(range: readonly [number, number]) {
  if (
    range.length !== 2 ||
    !range.every(Number.isFinite) ||
    range[0] < 0 ||
    range[1] > 1 ||
    range[0] >= range[1]
  ) {
    throw new Error('Reveal intervals must increase within [0, 1].');
  }
  return Object.freeze([...range]) as readonly [number, number];
}

function sharedMotion(recipe: SharedMotionRecipe | Transition): Transition {
  if ('renderer' in recipe) return recipe;
  if (recipe.kind !== 'bounds' && recipe.kind !== 'surface')
    throw new Error('Unknown shared motion kind.');
  if (recipe.zIndex !== undefined && !Number.isFinite(recipe.zIndex))
    throw new Error('zIndex must be finite.');
  if (
    recipe.radius &&
    (recipe.radius.length !== 2 ||
      !recipe.radius.every((value) => Number.isFinite(value) && value >= 0))
  )
    throw new Error('Corner radii must be two finite nonnegative numbers.');
  const kind = recipe.kind;
  const radius = recipe.radius ? ([...recipe.radius] as const) : undefined;
  function Renderer({
    source,
    target,
    progress,
    direction,
    zIndex,
    children,
  }: TransitionRendererProps) {
    const sourceSurface = resolveSurfaceStyle(source.style);
    const targetSurface = resolveSurfaceStyle(target.style);
    const backward = direction === 'backward';
    const sourceRadius =
      radius?.[backward ? 1 : 0] ?? sourceSurface.borderRadius;
    const targetRadius =
      radius?.[backward ? 0 : 1] ?? targetSurface.borderRadius;
    const props = {
      sourceMetrics: source.metrics,
      targetMetrics: target.metrics,
      progress,
      direction,
      zIndex,
    };
    return kind === 'surface' ? (
      <TransitionSurface
        {...props}
        sourceStyle={{
          ...sourceSurface,
          ...(sourceRadius === undefined ? {} : { borderRadius: sourceRadius }),
        }}
        targetStyle={{
          ...targetSurface,
          ...(targetRadius === undefined ? {} : { borderRadius: targetRadius }),
        }}
      >
        {children}
      </TransitionSurface>
    ) : (
      <TransitionFrame
        {...props}
        sourceBorderRadius={sourceRadius}
        targetBorderRadius={targetRadius}
      >
        {children}
      </TransitionFrame>
    );
  }
  return makeTransition({ renderer: Renderer, zIndex: recipe.zIndex });
}

function revealComponent<Names extends string>(
  recipes: RevealRecipes,
  entering: boolean
): ComponentType<TransitionRevealProps<Names>> {
  const frozen = new Map(
    Object.entries(recipes).map(([name, recipe]) => {
      if (!name.trim()) throw new Error('Transition roles must not be empty.');
      const translateY = recipe.translateY ?? 0;
      if (!Number.isFinite(translateY))
        throw new Error('Reveal translation must be finite.');
      return [
        name,
        {
          during: checkedRange(
            recipe.during ?? (entering ? [0.55, 0.9] : [0.1, 0.4])
          ),
          translateY,
        },
      ];
    })
  );
  return function Reveal({ name, children, style }) {
    const recipe = frozen.get(name);
    if (!recipe)
      throw new Error(`Unknown ${entering ? 'enter' : 'exit'} role "${name}".`);
    const { progress, phase, direction } = useChoreographyProgress();
    const reduceMotion = useReducedMotion();
    const motion = useAnimatedStyle(() => {
      const amount = interpolate(
        phase === 'preparing'
          ? direction === 'backward'
            ? 1
            : 0
          : progress.value,
        [...recipe.during],
        entering ? [0, 1] : [1, 0],
        'clamp'
      );
      const visible = phase === 'idle' ? 1 : amount;
      return {
        opacity: visible,
        transform: [
          { translateY: reduceMotion ? 0 : (1 - visible) * recipe.translateY },
        ],
      };
    });
    return <Animated.View style={[style, motion]}>{children}</Animated.View>;
  };
}

/** Define once outside render. Shared roles always retain one live component. */
export function defineTransition<
  const Shared extends SharedRecipes = {},
  const Enter extends RevealRecipes = {},
  const Exit extends RevealRecipes = {},
>(
  definition: TransitionDefinition<Shared, Enter, Exit>
): DefinedTransition<
  Extract<keyof Shared, string>,
  Extract<keyof Enter, string>,
  Extract<keyof Exit, string>
> {
  const entries = Object.entries(definition.shared ?? {});
  if (
    !entries.length &&
    !Object.keys(definition.enter ?? {}).length &&
    !Object.keys(definition.exit ?? {}).length
  )
    throw new Error('defineTransition requires at least one role.');
  const transitions = new Map(
    entries.map(([name, recipe]) => {
      if (!name.trim()) throw new Error('Transition roles must not be empty.');
      return [name, sharedMotion(recipe)];
    })
  );
  const resolve = (name: string) => {
    const transition = transitions.get(name);
    if (!transition) throw new Error(`Unknown shared role "${name}".`);
    return transition;
  };
  const duration = definition.motion?.duration;
  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))
    throw new Error('Transition duration must be finite and positive.');
  const navigationOptions = Object.freeze({
    ...definition.motion,
    ...(definition.motion?.spring
      ? { spring: Object.freeze({ ...definition.motion.spring }) }
      : {}),
  });
  type Name = Extract<keyof Shared, string>;
  function Element({ name, ...props }: TransitionElementProps<Name>) {
    return <SharedElement {...props} id={name} transition={resolve(name)} />;
  }
  function Target({ name, ...props }: TransitionTargetProps<Name>) {
    return (
      <SharedElement.Target {...props} id={name} transition={resolve(name)} />
    );
  }
  Element.Target = Target;
  return Object.freeze({
    Element,
    Enter: revealComponent<Extract<keyof Enter, string>>(
      definition.enter ?? {},
      true
    ),
    Exit: revealComponent<Extract<keyof Exit, string>>(
      definition.exit ?? {},
      false
    ),
    navigationOptions,
  });
}

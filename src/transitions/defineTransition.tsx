import type { ComponentType, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { SharedElement } from '../components/SharedElement';
import type {
  ChoreographyNavigationOptions,
  SharedElementTransition,
} from '../types';
import {
  createDeclarativeRenderer,
  type FadeRecipe,
  type SharedRecipe,
} from './declarativeRecipes';

type Motion = Pick<ChoreographyNavigationOptions, 'spring' | 'duration'>;
type Recipes = Record<string, SharedRecipe>;
type Fades = Record<string, FadeRecipe>;

export interface TransitionDefinition<
  Shared extends Recipes = Recipes,
  Enter extends Fades = Fades,
  Exit extends Fades = Fades,
> {
  motion?: Motion;
  shared?: Shared;
  enter?: Enter;
  exit?: Exit;
}

export interface TransitionElementProps<Role extends string = string> {
  name: Role;
  groupId: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export interface DefinedTransition<Role extends string = string> {
  Element: ComponentType<TransitionElementProps<Role>> & {
    Target: typeof SharedElement.Target;
  };
  /** Spread into navigation options; motion remains one clock for every role. */
  navigationOptions: Readonly<Motion>;
}

/** Define once outside render and reuse on both screens, including for Back. */
export function defineTransition<
  const Shared extends Recipes = {},
  const Enter extends Fades = {},
  const Exit extends Fades = {},
>(
  definition: TransitionDefinition<Shared, Enter, Exit>
): DefinedTransition<Extract<keyof Shared | keyof Enter | keyof Exit, string>> {
  type Role = Extract<keyof Shared | keyof Enter | keyof Exit, string>;
  const shared: Recipes = definition.shared ?? {};
  const enter: Fades = definition.enter ?? {};
  const exit: Fades = definition.exit ?? {};
  const roles = new Set([
    ...Object.keys(shared),
    ...Object.keys(enter),
    ...Object.keys(exit),
  ]);
  if (roles.size === 0) {
    throw new Error('defineTransition requires at least one element role.');
  }

  const transitions = new Map<string, SharedElementTransition>();
  for (const role of roles) {
    if (!role.trim()) {
      throw new Error('Transition roles must not be empty.');
    }
    const sharedRecipe = Object.hasOwn(shared, role) ? shared[role] : undefined;
    const enterRecipe = Object.hasOwn(enter, role) ? enter[role] : undefined;
    const exitRecipe = Object.hasOwn(exit, role) ? exit[role] : undefined;
    if (sharedRecipe && (enterRecipe || exitRecipe)) {
      throw new Error(
        `Role "${role}" cannot be shared and enter/exit content.`
      );
    }
    if (
      enterRecipe &&
      exitRecipe &&
      (enterRecipe.zIndex ?? 0) !== (exitRecipe.zIndex ?? 0)
    ) {
      throw new Error(`Enter and exit zIndex must match for role "${role}".`);
    }
    for (const recipe of [enterRecipe, exitRecipe]) {
      const follows =
        typeof recipe?.follow === 'string'
          ? [recipe.follow]
          : (recipe?.follow ?? []);
      for (const anchor of follows) {
        if (!Object.hasOwn(shared, anchor)) {
          throw new Error(
            `Role "${role}" follows unknown shared role "${anchor}".`
          );
        }
      }
    }
    transitions.set(
      role,
      Object.freeze({
        renderer: createDeclarativeRenderer({
          shared: sharedRecipe,
          enter: enterRecipe,
          exit: exitRecipe,
        }),
        zIndex:
          sharedRecipe?.zIndex ??
          enterRecipe?.zIndex ??
          exitRecipe?.zIndex ??
          0,
        unpaired: sharedRecipe
          ? undefined
          : enterRecipe && exitRecipe
            ? 'either'
            : enterRecipe
              ? 'expanded'
              : 'collapsed',
      })
    );
  }

  const duration = definition.motion?.duration;
  if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) {
    throw new Error('Transition duration must be a finite positive number.');
  }
  const navigationOptions = Object.freeze({
    ...definition.motion,
    ...(definition.motion?.spring
      ? { spring: Object.freeze({ ...definition.motion.spring }) }
      : {}),
  });

  function Element({ name, groupId, ...props }: TransitionElementProps<Role>) {
    const transition = transitions.get(name);
    if (!transition) {
      throw new Error(`Unknown transition role "${name}".`);
    }
    return (
      <SharedElement
        {...props}
        id={name}
        groupId={groupId}
        transition={transition}
      />
    );
  }
  Element.Target = SharedElement.Target;
  return Object.freeze({ Element, navigationOptions });
}

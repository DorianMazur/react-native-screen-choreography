export { ChoreographyProvider } from '../components/ChoreographyProvider';
export {
  SharedElement,
  type SharedElementProps,
  type SharedElementTargetProps,
} from '../components/SharedElement';
export { TransitionSurface } from '../standin/TransitionSurface';
export { TransitionFrame } from '../standin/TransitionFrame';
export {
  makeTransition,
  type MakeTransitionOptions,
} from '../transitions/makeTransition';
export {
  resolveSurfaceStyle,
  type BoxShadowEntry,
  type SurfaceTransitionStyle,
} from '../standin/resolveSurfaceStyle';
export { useChoreographyBlocker } from '../hooks/useChoreographyBlocker';
export {
  useChoreographyControls,
  useChoreographyProgress,
  useLatchedReveal,
} from '../hooks/useChoreographyProgress';
export { useRevealStyle, type RevealOptions } from '../hooks/useRevealStyle';
export { Springs, Easings } from '../core/constants';
export { setDebugEnabled } from '../debug/logger';
export type {
  ScreenRole,
  SessionPhase,
  TransitionDirection,
  ScreenFadeConfig,
} from '../core/screenVisibility';
export type {
  ChoreographyPreparationStage,
  ChoreographyPreparationTrace,
  SpringConfig,
  ElementMetrics,
  TransitionAnchor,
  ElementPresentation,
  SharedElementTransition,
  SharedElementTransitionRenderer,
  SharedElementTransitionRendererProps,
  SharedElementTransitionSide,
  Transition,
  TransitionRendererProps,
  TransitionEndpoint,
  TransitionConfig,
  ChoreographyNavigationOptions,
  ChoreographyNavigationLineage,
  InteractiveBackOptions,
  InteractiveTransitionSession,
  InteractiveTransitionHandle,
  InteractiveTransitionSettleOptions,
  InteractiveTransitionDecisionOptions,
  ChoreographyDebugConfig,
  ChoreographyDebugLevel,
  ChoreographyDebugCategory,
} from '../types';

export {
  useInteractiveGestureLifecycle,
  type InteractiveGestureController,
  type InteractiveGestureOptions,
  type InteractiveGestureRelease,
} from '../hooks/useInteractiveGestureLifecycle';

export {
  useSharedElementPresentation,
  type SharedElementPresentation,
  type SharedElementEndpoint,
} from '../core/SharedElementPresentation';

export {
  defineTransition,
  type DefinedTransition,
  type TransitionDefinition,
  type TransitionElementProps,
  type TransitionTargetProps,
  type TransitionRevealProps,
  type SharedMotionRecipe,
  type RevealRecipe,
} from '../transitions/defineTransition';

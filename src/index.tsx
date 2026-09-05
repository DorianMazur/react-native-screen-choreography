// Components
export { ChoreographyProvider } from './components/ChoreographyProvider';
export { ChoreographyScreen } from './components/ChoreographyScreen';
export {
  SharedElement,
  type LiveSharedElementProps,
  type LiveSharedElementTargetProps,
  type SharedElementProps,
  type SharedElementTargetProps,
} from './components/SharedElement';
export {
  createSharedElementComponent,
  type SharedElementComponentProps,
} from './components/createSharedElementComponent';

// Stand-in components
export { StandInContainer } from './standin/StandInContainer';
export { StandInElement } from './standin/StandInElement';
export { StandInCrossfade } from './standin/StandInCrossfade';
export {
  resolveSurfaceStyle,
  type BoxShadowEntry,
  type SurfaceTransitionStyle,
} from './standin/resolveSurfaceStyle';

// Hooks
export { useChoreographyNavigation } from './hooks/useReactNavigationChoreography';
export { useChoreographyBlocker } from './hooks/useChoreographyBlocker';
export { useInteractiveTransition } from './hooks/useReactNavigationInteractiveTransition';
export {
  useChoreographyProgress,
  useLatchedReveal,
  useStaggeredReveal,
} from './hooks/useChoreographyProgress';

// Spring & easing presets
export { Springs, Easings } from './core/constants';
export type {
  ScreenRole,
  SessionPhase,
  TransitionDirection,
} from './core/screenVisibility';

// Debug
export { setDebugEnabled } from './debug/logger';

// Types
export type {
  SpringConfig,
  ElementMetrics,
  ElementPresentation,
  SharedElementTransition,
  SharedElementTransitionRenderer,
  SharedElementTransitionRendererProps,
  SharedElementTransitionSide,
  TransitionConfig,
  ChoreographyNavigationOptions,
  ChoreographyNavigationLineage,
  InteractiveBackOptions,
  InteractiveTransitionSession,
  InteractiveTransitionSettleOptions,
  InteractiveTransitionDecisionOptions,
  ChoreographyDebugConfig,
  ChoreographyDebugLevel,
  ChoreographyDebugCategory,
} from './types';

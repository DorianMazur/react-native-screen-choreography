// Components
export { ChoreographyProvider } from './ChoreographyProvider';
export { SharedElement } from './SharedElement';
export { ChoreographyScreen } from './ChoreographyScreen';
export { TransitionOverlay } from './TransitionOverlay';

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
export { useChoreography } from './hooks/useChoreography';
export { useScreenId } from './hooks/useScreenId';
export {
  useChoreographyProgress,
  useProgressRevealStyle,
  useLatchedReveal,
  useStaggeredReveal,
} from './hooks/useChoreographyProgress';
export { useChoreographyNavigation } from './hooks/useChoreographyNavigation';

// Engine
export { ElementRegistry } from './ElementRegistry';
export {
  TransitionCoordinator,
  createProgressValue,
} from './TransitionCoordinator';

// Utilities
export {
  measureElement,
  measureElements,
  measureElementsBatched,
  type BatchMeasureEntry,
} from './measurement';

// Utilities
export { Springs, Easings } from './animations/springs';

// Constants
export {
  DEFAULT_SPRING,
  SNAPPY_SPRING,
  FAST_SPRING,
  PROGRESS_RANGES,
  DEFAULT_BACKDROP_OPACITY,
} from './constants';

// Debug
export {
  setDebugEnabled,
  isDebugEnabled,
  getDebugLogs,
  clearDebugLogs,
} from './debug/logger';

// Types
export type {
  SpringConfig,
  ElementMetrics,
  SharedElementTransitionSide,
  SharedElementTransitionRendererProps,
  SharedElementTransitionRenderer,
  SharedElementTransition,
  RegisteredElement,
  TransitionState,
  ElementTransitionPair,
  TransitionSessionData,
  TransitionConfig,
  ChoreographyNavigationOptions,
  ChoreographyContextValue,
  DebugInfo,
} from './types';

export type { SharedElementProps } from './SharedElement';

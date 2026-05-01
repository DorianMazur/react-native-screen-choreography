// Components
export { ChoreographyProvider } from './ChoreographyProvider';
export { SharedElement } from './SharedElement';
export { ChoreographyScreen } from './ChoreographyScreen';
export { TransitionOverlay } from './TransitionOverlay';

// Stand-in components
export {
  StandInContainer,
  type BoxShadowEntry,
} from './standin/StandInContainer';
export { StandInElement } from './standin/StandInElement';
export { StandInCrossfade } from './standin/StandInCrossfade';

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

// Animation presets
export { Springs, Easings } from './animations/springs';
export { morphInterpolation, createMorphStyle } from './animations/morph';
export { moveResizeInterpolation } from './animations/moveResize';
export { crossfadeInterpolation } from './animations/crossfade';

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
  AnimationType,
  ResizeMode,
  AlignMode,
  SpringConfig,
  TimingConfig,
  SharedElementConfig,
  ElementMetrics,
  RegisteredElement,
  TransitionState,
  ElementTransitionPair,
  TransitionSessionData,
  ChoreographyTiming,
  TransitionConfig,
  ChoreographyContextValue,
  DebugInfo,
} from './types';

export type { SharedElementProps } from './SharedElement';

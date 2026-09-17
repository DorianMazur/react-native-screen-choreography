import { createContext, useContext } from 'react';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import type { ElementPresentation, ElementMetrics } from '../types';

export interface SharedElementEndpoint {
  metrics: ElementMetrics | null;
  metadata?: unknown;
  style?: ElementPresentation['style'];
}

export interface SharedElementPresentation {
  /** Provider-wide expansion clock; other elements and groups also drive it. */
  progress: SharedValue<number>;
  /**
   * This owner's expansion: follows progress while participating, otherwise
   * stays at 0 (collapsed/source) or 1 (expanded/destination).
   */
  presentationProgress: DerivedValue<number>;
  transitioning: boolean;
  collapsed: SharedElementEndpoint;
  expanded: SharedElementEndpoint;
  /** Endpoint currently owning the component when no animation is active. */
  settled: 'collapsed' | 'expanded';
}

export const SharedElementPresentationContext =
  createContext<SharedElementPresentation | null>(null);

/** Read endpoint data without creating a second component or native subtree. */
export function useSharedElementPresentation(): SharedElementPresentation {
  const value = useContext(SharedElementPresentationContext);
  if (!value)
    throw new Error(
      'useSharedElementPresentation requires a SharedElement owner.'
    );
  return value;
}

import type { RenderPhase } from './useRenderObservation';

/** Optional observations used by the benchmark, without changing screen state. */
export interface ExampleObservation {
  rendered?: (
    component: 'list' | 'hero',
    phase: RenderPhase,
    itemId?: string
  ) => void;
  mounted: (itemId: string) => () => void;
  loaded: (itemId: string) => void;
  failed: (itemId: string) => void;
}

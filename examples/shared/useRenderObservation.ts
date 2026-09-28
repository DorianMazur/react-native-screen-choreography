import { useLayoutEffect, useRef } from 'react';

export type RenderPhase = 'mount' | 'update';
export type RenderObserver = (phase: RenderPhase) => void;

/** Observe committed React renders; abandoned renders and UI worklets do not count. */
export function useRenderObservation(observer?: RenderObserver) {
  const committed = useRef(false);
  useLayoutEffect(() => {
    observer?.(committed.current ? 'update' : 'mount');
    committed.current = true;
  });
}

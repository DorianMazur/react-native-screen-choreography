import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { EffectCallback } from 'react';
import type { TrayStackState } from './stack';
import type { TrayFocusEffectOptions } from './types';

interface FocusStore {
  getStackSnapshot: () => TrayStackState;
  subscribe: (listener: () => void) => () => void;
}

export function useTrayFocusEffect(
  store: FocusStore | null,
  key: string | undefined,
  effect: EffectCallback,
  { afterTransition = false }: TrayFocusEffectOptions = {}
): void {
  if (!store || key === undefined)
    throw new Error(
      'useFocusEffect must be used inside a screen or custom header of its Tray.Provider.'
    );
  const getSnapshot = useCallback(() => {
    const state = store.getStackSnapshot();
    if (state.entries[state.entries.length - 1]?.key !== key) return false;
    if (!afterTransition) return true;
    return state.phase === 'open' &&
      state.nativeSettled &&
      !state.preparation &&
      !state.transition &&
      !state.queue.length
      ? state.revision
      : false;
  }, [store, key, afterTransition]);
  const focused = useSyncExternalStore(
    store.subscribe,
    getSnapshot,
    getSnapshot
  );
  useEffect(() => {
    // Another committed effect can navigate before this callback is delivered.
    // Never focus a stale route or a screen whose next transition has started.
    if (focused !== false && focused === getSnapshot()) return effect();
  }, [effect, focused, getSnapshot]);
}

import { initialTrayState, trayReducer } from './stack';
import type { TrayAction } from './stack';
import type { TrayParamList, TrayRoute, TrayState } from './types';

export function createTrayStateStore<P extends TrayParamList>() {
  let stack = initialTrayState;
  let snapshot: TrayState<P> = {
    route: undefined,
    depth: 0,
    isPresented: false,
  };
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    getStackSnapshot: () => stack,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(action: TrayAction) {
      const next = trayReducer(stack, action);
      if (next === stack) return;
      stack = next;
      const route = stack.entries[stack.entries.length - 1] as
        | TrayRoute<P>
        | undefined;
      const depth = stack.entries.length;
      const isPresented = stack.phase !== 'closed';
      if (
        route !== snapshot.route ||
        depth !== snapshot.depth ||
        isPresented !== snapshot.isPresented
      )
        snapshot = { route, depth, isPresented };
      listeners.forEach((listener) => listener());
    },
  };
}

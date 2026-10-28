import { initialTrayState, trayReducer } from './stack';
import type { TrayAction, TrayStackState } from './stack';
import type { TrayParamList, TrayRoute, TrayState } from './types';

type TrayLifecycleEvent =
  | 'onWillPresent'
  | 'onPresent'
  | 'onWillDismiss'
  | 'onDismiss';

type TrayDispatchObserver = (
  action: TrayAction,
  previous: TrayStackState,
  next: TrayStackState
) => void;

export function createTrayStateStore<P extends TrayParamList>(
  observe?: TrayDispatchObserver
) {
  let stack = initialTrayState;
  let lifecycleEvents: TrayLifecycleEvent[] = [];
  let snapshot: TrayState<P> = {
    route: undefined,
    depth: 0,
    isPresented: false,
  };
  const listeners = new Set<() => void>();
  function notifyObserver(action: TrayAction, previous: TrayStackState) {
    try {
      observe?.(action, previous, stack);
    } catch {
      // Diagnostic failures must not interrupt navigation or its subscribers.
    }
  }
  return {
    getSnapshot: () => snapshot,
    getStackSnapshot: () => stack,
    setObserver(observer?: TrayDispatchObserver) {
      observe = observer;
    },
    takeLifecycleEvents() {
      const events = lifecycleEvents;
      lifecycleEvents = [];
      return events;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(action: TrayAction) {
      const previous = stack;
      const next = trayReducer(stack, action);
      if (next === stack) {
        if (observe) notifyObserver(action, previous);
        return false;
      }
      // Preserve every accepted event across React batching. A native close
      // can also start a queued presentation in this same state update.
      if (next.dismissals !== stack.dismissals)
        lifecycleEvents.push('onDismiss');
      if (next.session !== stack.session) lifecycleEvents.push('onWillPresent');
      if (next.presented && !stack.presented) lifecycleEvents.push('onPresent');
      if (next.phase === 'closing' && stack.phase !== 'closing')
        lifecycleEvents.push('onWillDismiss');
      // Commit before notifying subscribers so reentrant commands see the
      // accepted operation, even when the public route snapshot is unchanged.
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
      if (observe) notifyObserver(action, previous);
      listeners.forEach((listener) => listener());
      return true;
    },
  };
}

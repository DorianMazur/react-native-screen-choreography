import { initialTrayState, trayReducer, type TrayAction } from './stack';
import type { TrayDiagnostics } from './diagnostics';

export type TrayEvent =
  | {
      type: 'onWillPresent' | 'onPresent' | 'onNavigate' | 'onWillDismiss';
      key: string;
    }
  | { type: 'onDismiss' };

let nextSession = 0;
export function createTrayStateStore() {
  let state = { ...initialTrayState, session: nextSession };
  let events: TrayEvent[] = [];
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    takeEvents() {
      const pending = events;
      events = [];
      return pending;
    },
    dispatch(action: TrayAction, observe?: TrayDiagnostics['dispatch']) {
      const old = state;
      state = trayReducer(old, action);
      if (old.phase === 'closed' && state.phase === 'opening')
        state = { ...state, session: ++nextSession };
      try {
        observe?.(action, old, state);
      } catch {
        /* Diagnostics are optional. */
      }
      if (state === old) return;
      const key = state.entries.at(-1)?.key;
      if (state.phase === 'closed') events.push({ type: 'onDismiss' });
      else if (key) {
        if (old.phase === 'closed') events.push({ type: 'onWillPresent', key });
        if (!old.presented && state.presented)
          events.push({ type: 'onPresent', key: old.entries.at(-1)!.key });
        if (old.phase !== 'closed' && key !== old.entries.at(-1)?.key)
          events.push({ type: 'onNavigate', key });
        if (state.phase === 'closing' && old.phase !== 'closing')
          events.push({ type: 'onWillDismiss', key });
      }
      listeners.forEach((listener) => listener());
    },
  };
}

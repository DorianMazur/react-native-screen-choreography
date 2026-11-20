/** Mounted presentation of React Navigation's routes. Route keys always come from the router. */
export interface TrayEntry {
  key: string;
  name: string;
  params?: object;
}

export type TrayRouteChange = {
  type: 'present' | 'push' | 'back' | 'popToRoot' | 'replace' | 'update';
  name: string;
  entries: TrayEntry[];
  direction: 1 | -1;
};

export interface TrayStackState {
  session: number;
  revision: number;
  phase: 'closed' | 'opening' | 'open' | 'closing';
  presented: boolean;
  nativeSettled: boolean;
  entries: TrayEntry[];
  transition?: {
    id: number;
    from: string;
    to: string;
    direction: 1 | -1;
    retained: TrayEntry[];
  };
  queue: TrayRouteChange[];
}

export const initialTrayState: TrayStackState = {
  session: 0,
  revision: 0,
  phase: 'closed',
  presented: false,
  nativeSettled: false,
  entries: [],
  queue: [],
};

export type TrayAction =
  | TrayRouteChange
  | { type: 'dismiss' }
  | { type: 'settled' | 'snapped'; session: number; index: number }
  | { type: 'transitionEnd'; session: number; id: number };

/** Compute visual direction from the current and incoming route keys. */
export function describeRouteChange(
  previous: TrayEntry[],
  routes: TrayEntry[]
): TrayRouteChange {
  const from = previous.at(-1);
  const to = routes.at(-1)!;
  const index = previous.findIndex((entry) => entry.key === to.key);
  const backward = index >= 0 && from?.key !== to.key;
  const push = !!from && routes.at(-2)?.key === from.key;
  const entries = routes;
  let type: TrayRouteChange['type'];
  if (!from) type = 'present';
  else if (from.key === to.key) type = 'update';
  else if (backward)
    type = index === 0 && previous.length > 2 ? 'popToRoot' : 'back';
  else type = push ? 'push' : 'replace';
  return {
    type,
    entries,
    name: to.name,
    direction: backward ? -1 : 1,
  };
}

function showRoutes(
  state: TrayStackState,
  command: TrayRouteChange
): TrayStackState {
  const from = state.entries.at(-1)!;
  const to = command.entries.at(-1)!;
  if (from.key === to.key) return { ...state, entries: command.entries };
  const id = state.revision + 1;
  const keys = new Set(command.entries.map((entry) => entry.key));
  return {
    ...state,
    revision: id,
    entries: command.entries,
    transition: {
      id,
      from: from.key,
      to: to.key,
      direction: command.direction,
      retained: state.entries.filter((entry) => !keys.has(entry.key)),
    },
  };
}

function drain(state: TrayStackState) {
  const next = state.queue.at(-1);
  if (state.phase !== 'open' || state.transition || !next) return state;
  // Navigation can change several times while the native host is busy.
  // Animate directly from the visible screen to the latest committed destination.
  const command = describeRouteChange(state.entries, next.entries);
  return showRoutes({ ...state, queue: [] }, command);
}

export function trayReducer(
  state: TrayStackState,
  action: TrayAction
): TrayStackState {
  if (
    'session' in action &&
    (action.session !== state.session || state.phase === 'closed')
  )
    return state;
  if (action.type === 'settled') {
    if (action.index === 0 && state.phase === 'closing')
      return {
        ...initialTrayState,
        session: state.session,
        revision: state.revision,
      };
    if (action.index !== 1 || state.phase === 'closing' || state.nativeSettled)
      return state;
    return drain({
      ...state,
      presented: true,
      nativeSettled: true,
      phase: 'open',
    });
  }
  if (action.type === 'snapped') {
    if (action.index === 0) return trayReducer(state, { type: 'dismiss' });
    return state.phase === 'closing'
      ? drain({ ...state, phase: 'open' })
      : state;
  }
  if (action.type === 'transitionEnd') {
    if (action.id !== state.transition?.id) return state;
    return drain({ ...state, transition: undefined });
  }
  if (action.type === 'dismiss') {
    if (state.phase === 'closed' || state.phase === 'closing') return state;
    return {
      ...state,
      phase: 'closing',
      nativeSettled: false,
    };
  }
  if (!('entries' in action)) return state;
  if (state.phase === 'closed')
    return action.type === 'present'
      ? {
          ...state,
          revision: state.revision + 1,
          phase: 'opening',
          entries: action.entries,
        }
      : state;
  if (state.phase !== 'open' || state.transition)
    return { ...state, queue: [action] };
  const change = describeRouteChange(state.entries, action.entries);
  return showRoutes(state, change);
}

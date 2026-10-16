export interface TrayEntry {
  key: string;
  name: string;
  params: unknown;
}
export type TrayCommand =
  | {
      [K in 'present' | 'push' | 'replace']: {
        type: K;
        name: string;
        params: unknown;
      };
    }['present' | 'push' | 'replace']
  | { type: 'back' }
  | { type: 'popToRoot' }
  | { type: 'dismiss' };

export interface TrayStackState {
  session: number;
  revision: number;
  phase: 'closed' | 'opening' | 'open' | 'closing';
  entries: TrayEntry[];
  transition?: {
    id: number;
    from: string;
    to: string;
    direction: 1 | -1;
    retained: TrayEntry[];
  };
  queue: TrayCommand[];
  dismissals: number;
}

export const initialTrayState: TrayStackState = {
  session: 0,
  revision: 0,
  phase: 'closed',
  entries: [],
  queue: [],
  dismissals: 0,
};

export type TrayAction =
  | TrayCommand
  | { type: 'settled'; session: number; index: number }
  | { type: 'snapped'; session: number; index: number }
  | { type: 'transitionEnd'; session: number; id: number };

function drain(state: TrayStackState): TrayStackState {
  if (state.phase !== 'open' || state.transition || !state.queue.length)
    return state;
  const [command, ...queue] = state.queue;
  return command ? trayReducer({ ...state, queue }, command) : state;
}

export function trayReducer(
  state: TrayStackState,
  action: TrayAction
): TrayStackState {
  if (action.type === 'transitionEnd') {
    if (action.session !== state.session || action.id !== state.transition?.id)
      return state;
    return drain({ ...state, transition: undefined });
  }
  if (action.type === 'settled' || action.type === 'snapped') {
    if (action.session !== state.session || state.phase === 'closed')
      return state;
    if (action.type === 'snapped') {
      return action.index === 0
        ? { ...state, phase: 'closing', queue: [] }
        : drain({ ...state, phase: 'open' });
    }
    if (action.index === 0 && state.phase === 'closing') {
      const next = state.queue.find((command) => command.type === 'present');
      const closed: TrayStackState = {
        ...state,
        phase: 'closed',
        entries: [],
        transition: undefined,
        queue: [],
        dismissals: state.dismissals + 1,
      };
      return next ? trayReducer(closed, next) : closed;
    }
    return action.index === 1 && state.phase === 'opening'
      ? drain({ ...state, phase: 'open' })
      : state;
  }
  if (action.type === 'dismiss') {
    return state.phase === 'closed'
      ? state
      : { ...state, phase: 'closing', queue: [] };
  }
  if (action.type === 'present' && state.phase === 'closed') {
    const revision = state.revision + 1;
    return {
      ...state,
      session: state.session + 1,
      revision,
      phase: 'opening',
      entries: [
        { key: String(revision), name: action.name, params: action.params },
      ],
    };
  }
  if (state.phase === 'closed') return state;
  if (state.phase === 'closing') {
    return action.type === 'present' ? { ...state, queue: [action] } : state;
  }
  if (state.phase === 'opening' || state.transition) {
    return { ...state, queue: [...state.queue, action] };
  }
  const from = state.entries[state.entries.length - 1]!;
  const revision = state.revision + 1;
  let entries: TrayEntry[];
  let direction: 1 | -1 = 1;
  if (action.type === 'back' || action.type === 'popToRoot') {
    if (state.entries.length === 1) {
      return action.type === 'back'
        ? trayReducer(state, { type: 'dismiss' })
        : drain(state);
    }
    entries = state.entries.slice(0, action.type === 'back' ? -1 : 1);
    direction = -1;
  } else {
    const entry = {
      key: String(revision),
      name: action.name,
      params: action.params,
    };
    entries =
      action.type === 'present'
        ? [entry]
        : [
            ...state.entries.slice(
              0,
              action.type === 'replace' ? -1 : undefined
            ),
            entry,
          ];
  }
  return {
    ...state,
    revision,
    entries,
    transition: {
      id: revision,
      from: from.key,
      to: entries[entries.length - 1]!.key,
      direction,
      retained: state.entries.filter((entry) => !entries.includes(entry)),
    },
  };
}

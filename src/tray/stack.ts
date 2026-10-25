export interface TrayEntry {
  key: string;
  name: string;
  params: unknown;
  groupId?: string;
  sharedFrom?: string;
}
export type TrayCommand =
  | {
      [K in 'present' | 'push' | 'replace']: {
        type: K;
        name: string;
        params: unknown;
        groupId?: string;
        /** Bound internally for pushes originating in a tray screen/header. */
        sourceRouteKey?: string;
      };
    }['present' | 'push' | 'replace']
  | { type: 'back' }
  | { type: 'popToRoot' }
  | { type: 'dismiss' };

export interface TrayStackState {
  session: number;
  revision: number;
  phase: 'closed' | 'opening' | 'open' | 'closing';
  /** Whether this session has received its first native open settlement. */
  presented: boolean;
  /** Whether native opening or reopening after an interrupted dismissal has settled. */
  nativeSettled: boolean;
  entries: TrayEntry[];
  preparation?: {
    id: number;
    command: TrayCommand;
    groupId: string;
    from: string;
  };
  transition?: {
    groupId?: string;
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
  presented: false,
  nativeSettled: false,
  entries: [],
  queue: [],
  dismissals: 0,
};

export type TrayAction =
  | TrayCommand
  | { type: 'settled'; session: number; index: number }
  | { type: 'snapped'; session: number; index: number }
  | { type: 'transitionEnd'; session: number; id: number }
  | { type: 'prepared'; session: number; id: number };

function drain(state: TrayStackState): TrayStackState {
  if (
    state.phase !== 'open' ||
    state.preparation ||
    state.transition ||
    !state.queue.length
  )
    return state;
  const [command, ...queue] = state.queue;
  return command
    ? drain(trayReducer({ ...state, queue }, command, false, true))
    : state;
}

export function trayReducer(
  state: TrayStackState,
  action: TrayAction,
  prepared = false,
  replaying = false
): TrayStackState {
  if (action.type === 'push' && !prepared) {
    if (
      state.phase !== 'open' ||
      state.preparation ||
      (state.queue.length && !replaying) ||
      (action.sourceRouteKey !== undefined &&
        state.entries[state.entries.length - 1]?.key !== action.sourceRouteKey)
    )
      return state;
    if (state.transition) {
      // A returning screen can receive input before the spring or native
      // handoff finishes. Keep its first push; stale outgoing callbacks and
      // repeat taps must not add destinations behind it.
      return state.transition.direction === -1 &&
        action.sourceRouteKey === state.transition.to
        ? { ...state, queue: [action] }
        : state;
    }
  }
  if (action.type === 'prepared') {
    if (
      action.session !== state.session ||
      action.id !== state.preparation?.id ||
      state.phase !== 'open'
    )
      return state;
    return trayReducer(
      { ...state, preparation: undefined },
      state.preparation.command,
      true
    );
  }
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
        ? {
            ...state,
            phase: 'closing',
            nativeSettled: false,
            preparation: undefined,
            queue: [],
          }
        : drain({ ...state, phase: 'open' });
    }
    if (action.index === 0 && state.phase === 'closing') {
      const next = state.queue.find((command) => command.type === 'present');
      const closed: TrayStackState = {
        ...state,
        phase: 'closed',
        nativeSettled: false,
        entries: [],
        transition: undefined,
        queue: [],
        dismissals: state.dismissals + 1,
      };
      return next ? trayReducer(closed, next) : closed;
    }
    return action.index === 1 &&
      (state.phase === 'opening' || state.phase === 'open') &&
      !state.nativeSettled
      ? drain({
          ...state,
          phase: 'open',
          presented: true,
          nativeSettled: true,
        })
      : state;
  }
  if (action.type === 'dismiss') {
    return state.phase === 'closed'
      ? state
      : {
          ...state,
          phase: 'closing',
          nativeSettled: false,
          preparation: undefined,
          queue: [],
        };
  }
  if (action.type === 'present' && state.phase === 'closed') {
    const revision = state.revision + 1;
    return {
      ...state,
      session: state.session + 1,
      revision,
      phase: 'opening',
      presented: false,
      nativeSettled: false,
      entries: [
        { key: String(revision), name: action.name, params: action.params },
      ],
    };
  }
  if (state.phase === 'closed') return state;
  if (state.phase === 'closing') {
    return action.type === 'present' ? { ...state, queue: [action] } : state;
  }
  if (state.phase === 'opening' || state.preparation || state.transition) {
    return { ...state, queue: [...state.queue, action] };
  }
  const from = state.entries[state.entries.length - 1]!;
  const groupId =
    action.type === 'push'
      ? action.groupId
      : (action.type === 'back' || action.type === 'popToRoot') &&
          from.sharedFrom ===
            state.entries[action.type === 'back' ? state.entries.length - 2 : 0]
              ?.key
        ? from.groupId
        : undefined;
  if (groupId && !prepared) {
    const id = state.revision + 1;
    return {
      ...state,
      revision: id,
      preparation: { id, command: action, groupId, from: from.key },
    };
  }
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
      ...(groupId ? { groupId, sharedFrom: from.key } : {}),
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
      ...(groupId ? { groupId } : {}),
      id: revision,
      from: from.key,
      to: entries[entries.length - 1]!.key,
      direction,
      retained: state.entries.filter((entry) => !entries.includes(entry)),
    },
  };
}

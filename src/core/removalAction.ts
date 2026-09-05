interface RemovalAction {
  type: string;
  source?: string;
  target?: string;
  payload?: object;
}

interface RemovalState {
  key: string;
  index: number;
  routes: readonly { key: string; name: string }[];
}

export function isSingleRouteBack(
  action: RemovalAction,
  state: RemovalState | undefined,
  routeKey: string,
  sourceScreenId: string | undefined,
  sourceRouteKey?: string
): boolean {
  if (!state) return false;
  if (action.type !== 'GO_BACK' && action.type !== 'POP') return false;
  if (
    action.type === 'POP' &&
    (!action.payload ||
      !('count' in action.payload) ||
      action.payload.count !== 1)
  )
    return false;
  return (
    state.index > 0 &&
    state.routes[state.index]?.key === routeKey &&
    (sourceRouteKey
      ? state.routes[state.index - 1]?.key === sourceRouteKey
      : state.routes[state.index - 1]?.name === sourceScreenId) &&
    (!action.source || action.source === routeKey) &&
    (!action.target || action.target === state.key)
  );
}

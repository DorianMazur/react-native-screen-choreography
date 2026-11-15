// A parent route may contain a partial navigation state during restoration.
export interface NavigationRoute {
  key?: string;
  name: string;
  state?: { index?: number; routes: readonly NavigationRoute[] };
}

export function isOnFocusedRoutePath(
  route: NavigationRoute | undefined,
  routeKey: string
): boolean {
  while (route) {
    if (route.key === routeKey) return true;
    const state: NavigationRoute['state'] = route.state;
    if (state?.index === undefined) return false;
    route = state.routes[state.index];
  }
  return false;
}

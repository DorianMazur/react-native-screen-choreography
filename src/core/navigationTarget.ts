import { isOnFocusedRoutePath, type NavigationRoute } from './focusedRoute';

interface NavigationTargetSource {
  getState: () =>
    | {
        index?: number;
        routeNames?: readonly string[];
        routes: readonly (NavigationRoute & { key: string })[];
      }
    | undefined;
  addListener: (event: 'state', listener: () => void) => () => void;
  getParent?: () => NavigationTargetSource | undefined;
}

// React Navigation bubbles a named action past navigators that don't own it.
// Observe the state of the same navigator that can handle that action.
function targetNavigator(
  navigation: NavigationTargetSource,
  name?: string
): NavigationTargetSource {
  if (!name) return navigation;
  const names = navigation.getState()?.routeNames;
  if (!names || names.includes(name)) return navigation;
  const parent = navigation.getParent?.();
  return parent ? targetNavigator(parent, name) : navigation;
}

export function waitForNavigationTarget(
  navigation: NavigationTargetSource,
  sourceRouteKey: string,
  targetRouteName?: string
): Promise<string | null> {
  const owner = targetNavigator(navigation, targetRouteName);
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (routeKey: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve(routeKey);
    };
    const check = () => {
      const state = owner.getState();
      const route = state?.routes[state.index ?? state.routes.length - 1];
      if (
        route &&
        !isOnFocusedRoutePath(route, sourceRouteKey) &&
        (!targetRouteName || route.name === targetRouteName)
      ) {
        finish(route.key);
      }
    };
    const timeout = setTimeout(() => finish(null), 700);
    unsubscribe = owner.addListener('state', check);
    check();
  });
}

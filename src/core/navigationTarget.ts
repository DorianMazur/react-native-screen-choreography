interface NavigationTargetSource {
  getState: () =>
    | {
        index?: number;
        routes: readonly { key: string; name: string }[];
      }
    | undefined;
  addListener: (event: 'state', listener: () => void) => () => void;
}

export function waitForNavigationTarget(
  navigation: NavigationTargetSource,
  sourceRouteKey: string,
  targetRouteName?: string
): Promise<string | null> {
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
      const state = navigation.getState();
      const route = state?.routes[state.index ?? state.routes.length - 1];
      if (
        route &&
        route.key !== sourceRouteKey &&
        (!targetRouteName || route.name === targetRouteName)
      ) {
        finish(route.key);
      }
    };
    const timeout = setTimeout(() => finish(null), 700);
    unsubscribe = navigation.addListener('state', check);
    check();
  });
}

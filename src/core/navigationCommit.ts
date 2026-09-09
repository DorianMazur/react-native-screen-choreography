export interface NavigationCommitResult {
  /** The outgoing route was removed from navigation state. */
  removed: boolean;
  /** A matching native presentation completion was observed. */
  presented: boolean;
}

/** Void remains supported for navigator-independent integrations. */
export type CommitBackNavigation = () => void | Promise<NavigationCommitResult>;

interface NavigationCommitEvent {
  target?: string;
  data?: { closing?: boolean };
}

export interface NavigationCommitSource {
  getState: () =>
    | { key?: string; index?: number; routes: readonly { key: string }[] }
    | undefined;
  getParent?: () => NavigationCommitSource | undefined;
  addListener: (
    event: 'state' | 'transitionEnd',
    listener: (event: NavigationCommitEvent) => void
  ) => () => void;
}

export const NAVIGATION_COMMIT_TIMEOUT = 700;

const presentationListeners = new Set<
  (event: NavigationCommitEvent, navigatorKey: string | undefined) => void
>();

function getNavigatorKey(navigation: NavigationCommitSource) {
  try {
    return navigation.getState()?.key;
  } catch {
    return undefined;
  }
}

/**
 * Forward presentation events while screens are mounted. A nested screen also
 * observes its parent route, e.g. a Home tab presented by the root native stack.
 * Events are never cached: a new commit cannot consume an old transition end.
 */
export function observeNavigationPresentation(
  navigation: NavigationCommitSource
): () => void {
  const visited = new Set<NavigationCommitSource>();
  const subscriptions: (() => void)[] = [];
  let current: NavigationCommitSource | undefined = navigation;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (typeof current.addListener === 'function') {
      const navigatorKey = getNavigatorKey(current);
      subscriptions.push(
        current.addListener('transitionEnd', (event) => {
          presentationListeners.forEach((listener) =>
            listener(event, navigatorKey)
          );
        })
      );
    }
    current = current.getParent?.();
  }
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

/**
 * Observe state and native presentation before dispatching a back action.
 * Confirmed removal accepts the commit without waiting for transitionEnd.
 * Presentation is diagnostic; the choreography animation owns visual handoff.
 */
export function createBackCommit(
  navigation: NavigationCommitSource,
  routeKey: string,
  dispatch: () => void
): () => Promise<NavigationCommitResult> {
  return () =>
    new Promise((resolve) => {
      let settled = false;
      let presented = false;
      let removalObserved = false;
      const navigatorKey = getNavigatorKey(navigation);
      const subscriptions: (() => void)[] = [];
      const isRemoved = () => {
        try {
          const state = navigation.getState();
          if (state && !state.routes.some((route) => route.key === routeKey)) {
            removalObserved = true;
          }
        } catch {
          // Route-scoped navigation may stop exposing state after unmount.
        }
        return removalObserved;
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        subscriptions.forEach((unsubscribe) => {
          try {
            unsubscribe();
          } catch {
            // Cleanup must not hide the result of an already dispatched action.
          }
        });
        const removed = isRemoved();
        resolve({ removed, presented: removed && presented });
      };
      const check = () => {
        const removed = isRemoved();
        if (removed) finish();
      };
      const timeout = setTimeout(finish, NAVIGATION_COMMIT_TIMEOUT);

      let destinationRouteKey: string | undefined;
      try {
        const state = navigation.getState();
        const sourceIndex = state?.routes.findIndex(
          (route) => route.key === routeKey
        );
        if (state && sourceIndex !== undefined && sourceIndex > 0) {
          destinationRouteKey = state.routes[sourceIndex - 1]?.key;
        }
      } catch {
        // A dispatch failure or missing state is reported by the final result.
      }
      const onPresentation = (event: NavigationCommitEvent) => {
        if (
          (event.target === routeKey && event.data?.closing === true) ||
          (destinationRouteKey !== undefined &&
            event.target === destinationRouteKey &&
            event.data?.closing === false)
        ) {
          presented = true;
          check();
        }
      };
      const onForwardedPresentation = (
        event: NavigationCommitEvent,
        sourceNavigatorKey: string | undefined
      ) => {
        if (navigatorKey !== undefined && sourceNavigatorKey === navigatorKey) {
          onPresentation(event);
        }
      };
      presentationListeners.add(onForwardedPresentation);
      subscriptions.push(() =>
        presentationListeners.delete(onForwardedPresentation)
      );
      try {
        subscriptions.push(navigation.addListener('state', check));
      } catch {
        // Navigator-independent bindings can lack native transition events.
      }
      try {
        subscriptions.push(
          navigation.addListener('transitionEnd', onPresentation)
        );
      } catch {
        // Retain state observation and the bounded outcome if unsupported.
      }
      try {
        dispatch();
        check();
      } catch {
        // Dispatch can throw after mutating navigation state. Report the state
        // we actually reached so callers never restore an already removed route.
        finish();
      }
    });
}

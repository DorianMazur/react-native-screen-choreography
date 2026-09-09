import {
  createBackCommit,
  NAVIGATION_COMMIT_TIMEOUT,
  observeNavigationPresentation,
  type NavigationCommitSource,
} from './navigationCommit';

type Listener = Parameters<NavigationCommitSource['addListener']>[1];

function createNavigation(keys = ['home', 'detail'], navigatorKey = 'stack') {
  const listeners = {
    state: new Set<Listener>(),
    transitionEnd: new Set<Listener>(),
  };
  const state = {
    key: navigatorKey,
    index: keys.length - 1,
    routes: keys.map((key) => ({ key })),
  };
  const navigation: NavigationCommitSource = {
    getState: jest.fn(() => state),
    addListener: jest.fn((event, listener) => {
      listeners[event].add(listener);
      return () => listeners[event].delete(listener);
    }),
  };
  const emitState = () => listeners.state.forEach((listener) => listener({}));
  const emitPresentation = (target: string, closing: boolean) =>
    listeners.transitionEnd.forEach((listener) =>
      listener({ target, data: { closing } })
    );
  const remove = () => {
    state.routes.pop();
    state.index -= 1;
    emitState();
  };
  return { navigation, state, listeners, remove, emitPresentation, emitState };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('subscribes before dispatch and joins removal with native completion', async () => {
  const source = createNavigation();
  const commit = createBackCommit(source.navigation, 'detail', () => {
    source.emitPresentation('detail', true);
    source.remove();
  });
  expect(await commit()).toEqual({ removed: true, presented: true });
  expect(source.listeners.state.size).toBe(0);
  expect(source.listeners.transitionEnd.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('accepted removal resolves before a late native presentation event', async () => {
  const source = createNavigation();
  const resolved = jest.fn();
  const result = createBackCommit(source.navigation, 'detail', source.remove)();
  result.then(resolved);
  await Promise.resolve();
  expect(resolved).toHaveBeenCalledWith({ removed: true, presented: false });
  expect(jest.getTimerCount()).toBe(0);
  source.emitPresentation('detail', true);
  expect(await result).toEqual({ removed: true, presented: false });
});

test('ignores another navigator presenting an identically keyed route', async () => {
  const source = createNavigation();
  const unrelated = createNavigation(['home', 'detail'], 'other-stack');
  const stopObserving = observeNavigationPresentation(unrelated.navigation);
  const resolved = jest.fn();
  const result = createBackCommit(source.navigation, 'detail', () => {})();
  result.then(resolved);
  try {
    unrelated.emitPresentation('home', false);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    source.remove();
    expect(await result).toEqual({ removed: true, presented: false });
  } finally {
    stopObserving();
    source.remove();
    await result;
  }
});

test('records destination presentation observed before source removal', async () => {
  const source = createNavigation(['home-tabs', 'detail']);
  const home = createNavigation(['home']);
  const parent = createNavigation(['home-tabs']);
  home.navigation.getParent = () => parent.navigation;
  // Stop traversal even if an adapter returns a cyclic parent chain.
  parent.navigation.getParent = () => home.navigation;
  const stopObserving = observeNavigationPresentation(home.navigation);
  try {
    const result = createBackCommit(source.navigation, 'detail', () => {})();
    parent.emitPresentation('home-tabs', false);
    source.remove();
    expect(await result).toEqual({ removed: true, presented: true });
  } finally {
    stopObserving();
  }
  expect(home.listeners.transitionEnd.size).toBe(0);
  expect(parent.listeners.transitionEnd.size).toBe(0);
});

test('does not replay cached presentation events or accept unrelated route instances', async () => {
  const source = createNavigation();
  const destination = createNavigation(['home']);
  const stopObserving = observeNavigationPresentation(destination.navigation);
  try {
    destination.emitPresentation('home', false);
    const result = createBackCommit(source.navigation, 'detail', () => {})();
    const resolved = jest.fn();
    result.then(resolved);
    source.emitPresentation('other-detail', true);
    source.emitPresentation('detail', false);
    destination.emitPresentation('home', true);
    destination.emitPresentation('other-home', false);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();
    source.remove();
    expect(await result).toEqual({ removed: true, presented: false });
  } finally {
    stopObserving();
  }
});

test('asynchronous removal resolves without waiting for native events or a timeout', async () => {
  const source = createNavigation();
  const resolved = jest.fn();
  const result = createBackCommit(source.navigation, 'detail', () => {})();
  result.then(resolved);
  await jest.advanceTimersByTimeAsync(100);
  expect(resolved).not.toHaveBeenCalled();
  source.remove();
  expect(await result).toEqual({ removed: true, presented: false });
  expect(jest.getTimerCount()).toBe(0);
  expect(source.listeners.state.size).toBe(0);
  expect(source.listeners.transitionEnd.size).toBe(0);
});

test('timeout checks removal when the navigator drops state events', async () => {
  const source = createNavigation();
  const result = createBackCommit(source.navigation, 'detail', () => {})();
  source.state.routes.pop();
  source.state.index -= 1;
  await jest.advanceTimersByTimeAsync(NAVIGATION_COMMIT_TIMEOUT);
  expect(await result).toEqual({ removed: true, presented: false });
  expect(jest.getTimerCount()).toBe(0);
});

test('does not treat a presentation event as proof a prevented route was removed', async () => {
  const source = createNavigation();
  const result = createBackCommit(source.navigation, 'detail', () => {
    source.emitPresentation('detail', true);
  })();
  await jest.advanceTimersByTimeAsync(NAVIGATION_COMMIT_TIMEOUT);
  expect(await result).toEqual({ removed: false, presented: false });
});

test.each([false, true])(
  'always resolves dispatch failures with observed removal=%s',
  async (removeBeforeThrow) => {
    const source = createNavigation();
    const result = createBackCommit(source.navigation, 'detail', () => {
      if (removeBeforeThrow) source.remove();
      throw new Error('dispatch failed');
    })();
    expect(await result).toEqual({
      removed: removeBeforeThrow,
      presented: false,
    });
    expect(jest.getTimerCount()).toBe(0);
  }
);

test('keeps observed removal when source navigation disappears after unmount', async () => {
  const source = createNavigation();
  const result = createBackCommit(source.navigation, 'detail', () => {
    source.remove();
    source.navigation.getState = () => undefined;
  })();
  expect(await result).toEqual({ removed: true, presented: false });
  expect(jest.getTimerCount()).toBe(0);
});

test('still dispatches when a navigator cannot subscribe to native events', async () => {
  const source = createNavigation();
  source.navigation.addListener = () => {
    throw new Error('unsupported event');
  };
  const dispatch = jest.fn(source.remove);
  const result = createBackCommit(source.navigation, 'detail', dispatch)();
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(await result).toEqual({ removed: true, presented: false });
  expect(jest.getTimerCount()).toBe(0);
});

test('does not forward destination events after the observing screen unmounts', async () => {
  const source = createNavigation();
  const destination = createNavigation(['home']);
  const stopObserving = observeNavigationPresentation(destination.navigation);
  stopObserving();
  const result = createBackCommit(source.navigation, 'detail', () => {})();
  destination.emitPresentation('home', false);
  source.remove();
  expect(await result).toEqual({ removed: true, presented: false });
});

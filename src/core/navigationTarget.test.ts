import type { NavigationRoute } from './focusedRoute';
import { waitForNavigationTarget } from './navigationTarget';

function createNavigation(
  route: NavigationRoute & { key: string } = {
    key: 'detail-first',
    name: 'Detail',
  },
  routeNames = [route.name]
) {
  let listener = () => {};
  const unsubscribe = jest.fn();
  const state = {
    index: 0,
    routeNames,
    routes: [route],
  };
  const navigation = {
    getState: () => state,
    addListener: jest.fn((_event: 'state', callback: () => void) => {
      listener = callback;
      return unsubscribe;
    }),
  };
  return { navigation, state, unsubscribe, emit: () => listener() };
}

test('resolves a new instance of the same screen after asynchronous navigation', async () => {
  const { navigation, state, emit, unsubscribe } = createNavigation();
  const target = waitForNavigationTarget(navigation, 'detail-first', 'Detail');
  state.routes.push({ key: 'detail-second', name: 'Detail' });
  state.index = 1;
  emit();
  expect(await target).toBe('detail-second');
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('resolves a destination already published by synchronous navigation', async () => {
  const { navigation, unsubscribe } = createNavigation();
  expect(await waitForNavigationTarget(navigation, 'list', 'Detail')).toBe(
    'detail-first'
  );
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('resolves a root detail when only the parent publishes the push from a tab', async () => {
  const root = createNavigation({ key: 'tabs', name: 'Tabs' }, [
    'Tabs',
    'Detail',
  ]);
  const tab = createNavigation({ key: 'list', name: 'List' });
  const navigation = { ...tab.navigation, getParent: () => root.navigation };
  const target = waitForNavigationTarget(navigation, 'list', 'Detail');

  root.state.routes.push({ key: 'root-detail', name: 'Detail' });
  root.state.index = 1;
  root.emit();

  expect(await target).toBe('root-detail');
  expect(root.unsubscribe).toHaveBeenCalledTimes(1);
});

test('uses the nearer navigator when both navigators declare the destination', async () => {
  const root = createNavigation();
  const child = createNavigation({ key: 'child-detail', name: 'Detail' });
  const navigation = { ...child.navigation, getParent: () => root.navigation };
  expect(await waitForNavigationTarget(navigation, 'list', 'Detail')).toBe(
    'child-detail'
  );
});

test('does not resolve a different React Navigation destination', async () => {
  jest.useFakeTimers();
  try {
    const { navigation, unsubscribe } = createNavigation();
    const target = waitForNavigationTarget(navigation, 'list', 'Other');
    await jest.runAllTimersAsync();
    expect(await target).toBeNull();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('times out without using the outgoing instance when navigation is a no-op', async () => {
  jest.useFakeTimers();
  try {
    const { navigation, unsubscribe } = createNavigation();
    const target = waitForNavigationTarget(navigation, 'detail-first');
    await jest.runAllTimersAsync();
    expect(await target).toBeNull();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

test('does not mistake the container of the current tab for a new destination', async () => {
  jest.useFakeTimers();
  try {
    const list = { key: 'list', name: 'List' };
    const tab = createNavigation(list);
    const root = createNavigation({
      key: 'tabs',
      name: 'Tabs',
      state: tab.state,
    });
    const navigation = { ...tab.navigation, getParent: () => root.navigation };
    const target = waitForNavigationTarget(navigation, list.key, 'Tabs');
    await jest.runAllTimersAsync();
    expect(await target).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

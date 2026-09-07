import { waitForNavigationTarget } from './navigationTarget';

function createNavigation() {
  let listener = () => {};
  const unsubscribe = jest.fn();
  const state = {
    index: 0,
    routes: [{ key: 'detail-first', name: 'Detail' }],
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

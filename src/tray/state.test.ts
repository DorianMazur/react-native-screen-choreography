import { createTrayStateStore } from './state';
import type { TrayAction } from './stack';

function fixture() {
  const store = createTrayStateStore();
  const { dispatch, getStackSnapshot: state } = store;
  dispatch({ type: 'present', name: 'Position', params: undefined });
  const root = store.getSnapshot().route!.key;
  const snap = (index: number) =>
    dispatch({ type: 'snapped', session: state().session, index });
  const settle = (index: number) =>
    dispatch({ type: 'settled', session: state().session, index });
  const finish = () =>
    dispatch({
      type: 'transitionEnd',
      session: state().session,
      id: state().transition!.id,
    });
  const prepare = () =>
    dispatch({
      type: 'prepared',
      session: state().session,
      id: state().preparation!.id,
    });
  const push = (name = 'Add', from = root, groupId?: string) =>
    dispatch({
      type: 'push',
      sourceRouteKey: from,
      name,
      params: undefined,
      groupId,
    });
  return { ...store, state, root, snap, settle, finish, prepare, push };
}

test('diagnostics observe committed dispatches before subscribers, including rejected stale callbacks', () => {
  const events: string[] = [];
  const observe = jest.fn((action, previous, next) => {
    expect(store.getStackSnapshot()).toBe(next);
    events.push(`${action.type}:${previous !== next}`);
  });
  const store = createTrayStateStore(observe);
  store.subscribe(() => events.push('subscriber'));
  store.dispatch({ type: 'present', name: 'Home', params: undefined });
  const session = store.getStackSnapshot().session;
  store.dispatch({ type: 'settled', session, index: 1 });
  store.dispatch({
    type: 'push',
    name: 'Detail',
    groupId: 'hero',
    params: undefined,
  });
  const preparation = store.getStackSnapshot().preparation!;
  store.dispatch({ type: 'prepared', session, id: preparation.id - 1 });
  expect(store.getStackSnapshot().preparation).toBe(preparation);
  store.dispatch({ type: 'prepared', session, id: preparation.id });
  expect(events).toEqual([
    'present:true',
    'subscriber',
    'settled:true',
    'subscriber',
    'push:true',
    'subscriber',
    'prepared:false',
    'prepared:true',
    'subscriber',
  ]);
  expect(observe).toHaveBeenCalledTimes(5);
});

test('a failing diagnostic observer cannot suppress navigation or subscriber updates', () => {
  const store = createTrayStateStore(() => {
    throw new Error('observer failed');
  });
  const subscriber = jest.fn();
  store.subscribe(subscriber);
  expect(
    store.dispatch({ type: 'present', name: 'Home', params: undefined })
  ).toBe(true);
  expect(subscriber).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().route?.name).toBe('Home');
});

test('push acceptance commits before subscribers and before any React render', () => {
  const f = fixture();
  expect(f.push()).toBe(false); // Opening.
  f.settle(1);
  const snapshot = f.getSnapshot();
  const reentrant = jest.fn(() => expect(f.push('CashOut')).toBe(false));
  f.subscribe(reentrant);
  expect(f.push('Add', f.root, 'chart')).toBe(true);
  expect(reentrant).toHaveBeenCalledTimes(1);
  expect(f.getSnapshot()).toBe(snapshot);
  expect(f.push()).toBe(false);
  expect(f.state().queue).toEqual([]);
});

test('cancelled preparation leaves the public snapshot unchanged and rejects stale acknowledgements during a retry', () => {
  const f = fixture();
  f.settle(1);
  const snapshot = f.getSnapshot();
  expect(f.push('Add', f.root, 'chart')).toBe(true);
  const stale: TrayAction = {
    type: 'prepared',
    session: f.state().session,
    id: f.state().preparation!.id,
  };
  f.snap(0);
  expect(f.push()).toBe(false);
  f.snap(1);
  expect(f.getSnapshot()).toBe(snapshot);
  expect(f.push('CashOut', f.root, 'chart')).toBe(true);
  const pending = f.state();
  expect(f.dispatch(stale)).toBe(false);
  expect(f.state()).toBe(pending);
  f.prepare();
  expect(f.getSnapshot().route?.name).toBe('CashOut');
  expect(f.dispatch(stale)).toBe(false);
  f.finish();
  expect(f.push()).toBe(false); // The source is no longer current.
});

test.each([
  ['forward', undefined],
  ['forward', 'chart'],
  ['back', undefined],
  ['back', 'chart'],
] as const)(
  'retains one push from the incoming screen until the %s/%s transition ends',
  (direction, groupId) => {
    const f = fixture();
    f.settle(1);
    expect(f.push('Add', f.root, groupId)).toBe(true);
    if (groupId) f.prepare();
    const editor = f.getSnapshot().route!.key;
    if (direction === 'back') {
      f.finish();
      f.dispatch({ type: 'back' });
      if (groupId) {
        expect(f.push()).toBe(false); // Source capture still owns the old route.
        f.prepare();
      }
    }
    const incoming = direction === 'back' ? f.root : editor;
    const outgoing = direction === 'back' ? editor : f.root;
    const returning = f.state();
    const snapshot = f.getSnapshot();
    expect(snapshot.route?.key).toBe(incoming);
    expect(f.push('CashOut', outgoing)).toBe(false);
    expect(
      f.dispatch({ type: 'push', name: 'Unbound', params: undefined })
    ).toBe(false);
    expect(f.push('CashOut', incoming, groupId)).toBe(true);
    expect(f.getSnapshot()).toBe(snapshot);
    expect(f.state().transition).toBe(returning.transition);
    expect(f.state().queue).toHaveLength(1);
    expect(f.push('Add', incoming)).toBe(false);
    expect(f.push('CashOut', incoming)).toBe(false);
    expect(
      f.dispatch({
        type: 'transitionEnd',
        session: returning.session,
        id: returning.transition!.id - 1,
      })
    ).toBe(false);
    f.finish();
    if (groupId) {
      expect(f.state().preparation?.command).toMatchObject({ name: 'CashOut' });
      f.prepare();
    }
    expect(f.getSnapshot().route?.name).toBe('CashOut');
    expect(f.getSnapshot().depth).toBe(direction === 'back' ? 2 : 3);
    expect(f.state().queue).toEqual([]);
    const next = f.state();
    expect(
      f.dispatch({
        type: 'transitionEnd',
        session: returning.session,
        id: returning.transition!.id,
      })
    ).toBe(false);
    expect(f.state()).toBe(next);
    f.finish();
    expect(f.getSnapshot().depth).toBe(direction === 'back' ? 2 : 3);
  }
);

test('returning-screen pushes cannot bypass earlier queued commands', () => {
  const f = fixture();
  f.settle(1);
  expect(f.push()).toBe(true);
  f.finish();
  const editor = f.getSnapshot().route!.key;
  f.dispatch({ type: 'back' });
  expect(f.getSnapshot().route?.key).toBe(f.root);
  expect(f.push('CashOut', editor)).toBe(false);
  f.dispatch({ type: 'popToRoot' });
  expect(f.state().queue).toEqual([{ type: 'popToRoot' }]);
  expect(f.push('CashOut')).toBe(false);
  f.finish();
  expect(f.getSnapshot().route?.key).toBe(f.root);
  expect(f.push('CashOut')).toBe(true);
  expect(f.state().queue).toEqual([]);
});

test('a returning-screen push replays before later navigation without stalling the queue', () => {
  const f = fixture();
  f.settle(1);
  f.push();
  f.finish();
  f.dispatch({ type: 'back' });
  expect(f.push('CashOut')).toBe(true);
  f.dispatch({ type: 'back' });
  f.finish();
  expect(f.getSnapshot().route?.name).toBe('CashOut');
  expect(f.state().queue).toEqual([{ type: 'back' }]);
  f.finish();
  expect(f.getSnapshot().route?.key).toBe(f.root);
  f.finish();
  expect(f.state().transition).toBeUndefined();
  expect(f.state().queue).toEqual([]);
});

test.each([
  ['forward', 'dismiss'],
  ['forward', 'drag'],
  ['back', 'dismiss'],
  ['back', 'drag'],
])(
  '%s/%s clears a pending push and stale completions cannot replay it',
  (direction, closing) => {
    const f = fixture();
    f.settle(1);
    f.push();
    if (direction === 'back') {
      f.finish();
      f.dispatch({ type: 'back' });
    }
    const returning = f.state();
    expect(f.push('CashOut', f.getSnapshot().route!.key)).toBe(true);
    if (closing === 'drag') f.snap(0);
    else f.dispatch({ type: 'dismiss' });
    expect(f.state().queue).toEqual([]);
    f.settle(0);
    f.dispatch({ type: 'present', name: 'Position', params: undefined });
    f.settle(1);
    const reopened = f.state();
    expect(
      f.dispatch({
        type: 'transitionEnd',
        session: returning.session,
        id: returning.transition!.id,
      })
    ).toBe(false);
    expect(f.state()).toBe(reopened);
    expect(f.getSnapshot().depth).toBe(1);
  }
);

test('pushes made while preparing or transitioning are discarded instead of queued', () => {
  const f = fixture();
  f.settle(1);
  f.push('Add', f.root, 'chart');
  expect(f.dispatch({ type: 'push', name: 'B', params: 2 })).toBe(false);
  expect(f.state().queue).toEqual([]);
  f.prepare();
  expect(f.dispatch({ type: 'push', name: 'C', params: 3 })).toBe(false);
  f.finish();
  expect(f.state().entries.map((entry) => entry.name)).toEqual([
    'Position',
    'Add',
  ]);
  expect(f.dispatch({ type: 'push', name: 'D', params: 4 })).toBe(true);
  f.finish();
  expect(f.state().entries.map((entry) => entry.name)).toEqual([
    'Position',
    'Add',
    'D',
  ]);
});

test('full dismissal and reopen reject callbacks from the removed session', () => {
  const f = fixture();
  f.settle(1);
  f.push('Add', f.root, 'chart');
  const old = f.state();
  f.dispatch({ type: 'dismiss' });
  expect(f.push()).toBe(false);
  f.settle(0);
  expect(f.push()).toBe(false);
  f.dispatch({ type: 'present', name: 'Position', params: undefined });
  const root = f.getSnapshot().route!.key;
  expect(f.push('Add', root)).toBe(false);
  f.settle(1);
  expect(f.push()).toBe(false);
  expect(f.push('Add', root, 'chart')).toBe(true);
  const pending = f.state();
  f.dispatch({
    type: 'prepared',
    session: old.session,
    id: old.preparation!.id,
  });
  f.dispatch({ type: 'snapped', session: old.session, index: 0 });
  f.dispatch({ type: 'settled', session: old.session, index: 0 });
  expect(f.state()).toBe(pending);
  f.prepare();
  f.finish();
  expect(f.getSnapshot().route?.name).toBe('Add');
});

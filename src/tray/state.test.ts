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

test('retained source keys cannot bypass Back transitions or queued commands', () => {
  const f = fixture();
  f.settle(1);
  expect(f.push()).toBe(true);
  f.finish();
  const editor = f.getSnapshot().route!.key;
  f.dispatch({ type: 'back' });
  expect(f.getSnapshot().route?.key).toBe(f.root);
  expect(f.push()).toBe(false);
  expect(f.push('CashOut', editor)).toBe(false);
  f.dispatch({ type: 'popToRoot' });
  expect(f.state().queue).toEqual([{ type: 'popToRoot' }]);
  expect(f.push('CashOut')).toBe(false);
  f.finish();
  expect(f.getSnapshot().route?.key).toBe(f.root);
  expect(f.push('CashOut')).toBe(true);
  expect(f.state().queue).toEqual([]);
});

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

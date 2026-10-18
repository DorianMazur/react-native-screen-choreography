import { initialTrayState, trayReducer } from './stack';
import type { TrayStackState } from './stack';

function opened(): TrayStackState {
  const state = trayReducer(initialTrayState, {
    type: 'present',
    name: 'home',
    params: undefined,
  });
  return trayReducer(state, {
    type: 'settled',
    session: state.session,
    index: 1,
  });
}
function finish(state: TrayStackState): TrayStackState {
  return trayReducer(state, {
    type: 'transitionEnd',
    session: state.session,
    id: state.transition!.id,
  });
}

test('push retains the same root; back retains the outgoing view until completion', () => {
  const root = opened();
  const pushed = finish(
    trayReducer(root, { type: 'push', name: 'form', params: { amount: 5 } })
  );
  expect(pushed.entries[0]).toBe(root.entries[0]);
  const back = trayReducer(pushed, { type: 'back' });
  expect(back.entries).toEqual(root.entries);
  expect(back.transition?.retained).toEqual([pushed.entries[1]]);
  expect(finish(back).transition).toBeUndefined();
});

test('serializes rapid push, back, and push without losing the newest destination', () => {
  let state = opened();
  state = trayReducer(state, { type: 'push', name: 'a', params: undefined });
  state = trayReducer(state, { type: 'back' });
  state = trayReducer(state, { type: 'push', name: 'b', params: 2 });
  state = finish(state);
  expect(state.transition?.direction).toBe(-1);
  state = finish(state);
  expect(state.entries.map((e) => e.name)).toEqual(['home', 'b']);
  state = finish(state);
  expect(state.queue).toEqual([]);
});

test('Back while opening waits for native settlement then dismisses', () => {
  let state = trayReducer(initialTrayState, {
    type: 'present',
    name: 'home',
    params: undefined,
  });
  state = trayReducer(state, { type: 'back' });
  expect(state.phase).toBe('opening');
  state = trayReducer(state, {
    type: 'settled',
    session: state.session,
    index: 1,
  });
  expect(state.phase).toBe('closing');
  expect(state.entries).toHaveLength(1);
});

test('dismiss interrupts a view transition; only native confirmation releases its content', () => {
  let state = trayReducer(opened(), {
    type: 'push',
    name: 'a',
    params: undefined,
  });
  state = trayReducer(state, { type: 'push', name: 'b', params: undefined });
  state = trayReducer(state, { type: 'dismiss' });
  expect(state.phase).toBe('closing');
  expect(state.entries).toHaveLength(2);
  expect(state.queue).toEqual([]);
  state = finish(state);
  expect(state.phase).toBe('closing');
  state = trayReducer(state, {
    type: 'settled',
    session: state.session,
    index: 0,
  });
  expect(state.entries).toEqual([]);
  expect(state.dismissals).toBe(1);
});

test('reopens only after removal; old native and animation callbacks cannot close the new session', () => {
  let state = trayReducer(opened(), {
    type: 'push',
    name: 'a',
    params: undefined,
  });
  const old = state;
  state = trayReducer(state, { type: 'dismiss' });
  state = trayReducer(state, { type: 'present', name: 'next', params: 42 });
  expect(state.phase).toBe('closing');
  state = trayReducer(state, {
    type: 'settled',
    session: state.session,
    index: 0,
  });
  expect(state.phase).toBe('opening');
  expect(state.entries[0]?.name).toBe('next');
  expect(
    trayReducer(state, { type: 'settled', session: old.session, index: 0 })
  ).toBe(state);
  expect(
    trayReducer(state, {
      type: 'transitionEnd',
      session: old.session,
      id: old.transition!.id,
    })
  ).toBe(state);
});

test('a drag returning to the open detent cancels dismissal without discarding state', () => {
  const root = opened();
  let state = trayReducer(root, {
    type: 'snapped',
    session: root.session,
    index: 0,
  });
  state = trayReducer(state, {
    type: 'snapped',
    session: root.session,
    index: 1,
  });
  state = trayReducer(state, {
    type: 'settled',
    session: root.session,
    index: 0,
  });
  expect(state.phase).toBe('open');
  expect(state.entries).toBe(root.entries);
  expect(state.dismissals).toBe(0);
});

test('replace and popToRoot keep removed views only for the current transition', () => {
  let state = finish(
    trayReducer(opened(), { type: 'push', name: 'form', params: undefined })
  );
  const root = state.entries[0];
  state = trayReducer(state, {
    type: 'replace',
    name: 'done',
    params: undefined,
  });
  expect(state.entries.map((e) => e.name)).toEqual(['home', 'done']);
  expect(state.transition?.retained.map((e) => e.name)).toEqual(['form']);
  state = trayReducer(finish(state), {
    type: 'push',
    name: 'extra',
    params: undefined,
  });
  state = trayReducer(finish(state), { type: 'popToRoot' });
  expect(state.entries).toEqual([root]);
  expect(state.transition?.retained).toHaveLength(2);
  expect(finish(state).transition).toBeUndefined();
});

test('no-op popToRoot drains queued commands and stale animation completion is ignored', () => {
  let state = trayReducer(opened(), {
    type: 'present',
    name: 'newRoot',
    params: undefined,
  });
  const oldTransition = state.transition!;
  state = trayReducer(state, { type: 'popToRoot' });
  state = trayReducer(state, { type: 'push', name: 'next', params: undefined });
  state = finish(state);
  expect(state.entries.map((e) => e.name)).toEqual(['newRoot', 'next']);
  expect(
    trayReducer(state, {
      type: 'transitionEnd',
      session: state.session,
      id: oldTransition.id,
    })
  ).toBe(state);
});

test('captures the source before mounting a shared destination and remembers the return group', () => {
  const root = opened();
  const pending = trayReducer(root, {
    type: 'push',
    name: 'preview',
    params: 1,
    groupId: 'person',
  });
  expect(pending.entries).toBe(root.entries);
  expect(pending.transition).toBeUndefined();
  const queued = trayReducer(pending, { type: 'back' });
  const pushed = trayReducer(queued, {
    type: 'prepared',
    session: pending.session,
    id: pending.preparation!.id,
  });
  expect(pushed.transition?.groupId).toBe('person');
  expect(pushed.entries.at(-1)?.sharedFrom).toBe(root.entries[0]!.key);
  const returning = finish(pushed);
  expect(returning.preparation?.groupId).toBe('person');
  expect(returning.entries).toBe(pushed.entries);
  const back = trayReducer(returning, {
    type: 'prepared',
    session: returning.session,
    id: returning.preparation!.id,
  });
  expect(back.transition).toMatchObject({ groupId: 'person', direction: -1 });
  expect(back.transition?.retained).toEqual([pushed.entries[1]]);
  expect(finish(back).entries).toEqual(root.entries);
});

test('dismissal rejects late shared preparation and does not reopen its destination', () => {
  const pending = trayReducer(opened(), {
    type: 'push',
    name: 'preview',
    params: 1,
    groupId: 'person',
  });
  const closing = trayReducer(pending, { type: 'dismiss' });
  expect(closing.preparation).toBeUndefined();
  expect(
    trayReducer(closing, {
      type: 'prepared',
      session: pending.session,
      id: pending.preparation!.id,
    })
  ).toBe(closing);
  const closed = trayReducer(closing, {
    type: 'settled',
    session: closing.session,
    index: 0,
  });
  expect(closed.entries).toEqual([]);
});

test('popToRoot only shares elements when the root is the original source', () => {
  const middle = finish(
    trayReducer(opened(), { type: 'push', name: 'middle', params: undefined })
  );
  const pending = trayReducer(middle, {
    type: 'push',
    name: 'preview',
    params: undefined,
    groupId: 'person',
  });
  const pushed = finish(
    trayReducer(pending, {
      type: 'prepared',
      session: pending.session,
      id: pending.preparation!.id,
    })
  );
  const root = trayReducer(pushed, { type: 'popToRoot' });
  expect(root.preparation).toBeUndefined();
  expect(root.transition?.groupId).toBeUndefined();
});

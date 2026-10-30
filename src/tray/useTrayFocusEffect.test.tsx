import { useCallback, useLayoutEffect, useSyncExternalStore } from 'react';
import {
  act,
  render as renderComponent,
  type RenderResult,
} from '@testing-library/react-native/pure';
import { createTrayStateStore } from './state';
import { useTrayFocusEffect } from './useTrayFocusEffect';
import type { TrayFocusEffectOptions } from './types';

function fixture(afterTransition = true) {
  const store = createTrayStateStore();
  const events: string[] = [];
  function Observer({ id, value }: { id: string; value: string }) {
    useTrayFocusEffect(
      store,
      id,
      useCallback(() => {
        events.push(`start ${id} ${value}`);
        return () => {
          events.push(`cleanup ${id} ${value}`);
        };
      }, [id, value]),
      { afterTransition }
    );
    return null;
  }
  function Screens({ value }: { value: string }) {
    const state = useSyncExternalStore(store.subscribe, store.getStackSnapshot);
    return (
      <>
        {[...state.entries, ...(state.transition?.retained ?? [])].map(
          (entry) => (
            <Observer key={entry.key} id={entry.key} value={value} />
          )
        )}
      </>
    );
  }
  let renderer!: RenderResult;

  renderer = renderComponent(<Screens value="first" />);

  const state = store.getStackSnapshot;
  const dispatch = (action: Parameters<typeof store.dispatch>[0]) =>
    act(() => {
      store.dispatch(action);
    });
  const settle = (index = 1) =>
    dispatch({ type: 'settled', session: state().session, index });
  const snap = (index: number) =>
    dispatch({ type: 'snapped', session: state().session, index });
  const finish = () =>
    dispatch({
      type: 'transitionEnd',
      session: state().session,
      id: state().transition!.id,
    });
  const present = () =>
    dispatch({ type: 'present', name: 'form', params: undefined });
  const push = (groupId?: string) =>
    dispatch({ type: 'push', name: 'form', params: undefined, groupId });
  const prepare = () =>
    dispatch({
      type: 'prepared',
      session: state().session,
      id: state().preparation!.id,
    });
  const update = (value: string) =>
    act(() => renderer.rerender(<Screens value={value} />));
  const unmount = () => act(() => renderer.unmount());
  const current = () => state().entries.at(-1)!.key;
  return {
    store,
    state,
    events,
    dispatch,
    settle,
    snap,
    finish,
    present,
    push,
    prepare,
    update,
    unmount,
    current,
  };
}

test('settled focus waits for native opening, not the selected open detent', () => {
  const f = fixture();
  f.present();
  const root = f.current();
  f.snap(1);
  expect(f.events).toEqual([]);
  f.settle();
  expect(f.events).toEqual([`start ${root} first`]);
  f.settle();
  f.snap(1);
  expect(f.events).toHaveLength(1);
  f.unmount();
  expect(f.events.at(-1)).toBe(`cleanup ${root} first`);
});

test('settled focus follows completed push, replace, Back, popToRoot, and present', () => {
  const f = fixture();
  f.present();
  f.settle();
  const root = f.current();
  f.push();
  const pushed = f.current();
  expect(f.events).toEqual([`start ${root} first`, `cleanup ${root} first`]);
  f.finish();
  expect(f.events.at(-1)).toBe(`start ${pushed} first`);
  f.dispatch({ type: 'replace', name: 'form', params: undefined });
  const replacement = f.current();
  expect(f.events.at(-1)).toBe(`cleanup ${pushed} first`);
  f.finish();
  expect(f.events.at(-1)).toBe(`start ${replacement} first`);
  f.dispatch({ type: 'back' });
  expect(f.events.at(-1)).toBe(`cleanup ${replacement} first`);
  f.finish();
  expect(f.events.at(-1)).toBe(`start ${root} first`);
  f.push();
  f.finish();
  f.push();
  f.finish();
  f.dispatch({ type: 'popToRoot' });
  const count = f.events.length;
  f.finish();
  expect(f.events.slice(count)).toEqual([`start ${root} first`]);
  f.present();
  const fresh = f.current();
  expect(f.events.at(-1)).toBe(`cleanup ${root} first`);
  f.finish();
  expect(f.events.at(-1)).toBe(`start ${fresh} first`);
  f.unmount();
});

test('queued navigation never focuses a transient destination and rejects stale completions', () => {
  const f = fixture();
  f.present();
  f.settle();
  const root = f.current();
  f.push();
  const old = f.state();
  f.dispatch({ type: 'back' });
  f.finish();
  expect(f.current()).toBe(root);
  expect(f.events).toEqual([`start ${root} first`, `cleanup ${root} first`]);
  f.dispatch({
    type: 'transitionEnd',
    session: old.session,
    id: old.transition!.id,
  });
  expect(f.events).toHaveLength(2);
  f.finish();
  expect(f.events.at(-1)).toBe(`start ${root} first`);
  f.unmount();
});

test('shared preparation and native handoff keep settled focus suspended until transitionEnd', () => {
  const f = fixture();
  f.present();
  f.settle();
  const root = f.current();
  f.push('avatar');
  expect(f.current()).toBe(root);
  expect(f.events.at(-1)).toBe(`cleanup ${root} first`);
  f.prepare();
  const target = f.current();
  f.settle();
  f.update('latest');
  expect(f.events).toHaveLength(2);
  // Shared transitions dispatch this only after the overlay handoff completes.
  f.finish();
  expect(f.events.at(-1)).toBe(`start ${target} latest`);
  f.unmount();
});

test('cancelled dismissal waits for native reopening settlement before restoring the effect', () => {
  const f = fixture();
  f.present();
  f.settle();
  const root = f.current();
  f.snap(0);
  expect(f.events.at(-1)).toBe(`cleanup ${root} first`);
  f.snap(1);
  expect(f.events).toHaveLength(2);
  f.settle();
  expect(f.events.at(-1)).toBe(`start ${root} first`);
  f.dispatch({ type: 'dismiss' });
  f.present();
  const old = f.state();
  f.settle(0);
  const reopened = f.current();
  f.dispatch({ type: 'settled', session: old.session, index: 1 });
  expect(f.events.at(-1)).toBe(`cleanup ${root} first`);
  f.settle();
  expect(f.events.at(-1)).toBe(`start ${reopened} first`);
  f.unmount();
});

test('closing during opening or a screen transition cannot run an unsettled effect', () => {
  const f = fixture();
  f.present();
  f.dispatch({ type: 'dismiss' });
  f.settle();
  expect(f.events).toEqual([]);
  f.settle(0);
  f.present();
  f.settle();
  f.push();
  f.dispatch({ type: 'dismiss' });
  const count = f.events.length;
  f.finish();
  f.settle(0);
  expect(f.events).toHaveLength(count);
  f.unmount();
});

test('callback changes restart settled effects and apply the latest callback after a transition', () => {
  const f = fixture();
  f.present();
  f.update('second');
  expect(f.events).toEqual([]);
  f.settle();
  const root = f.current();
  expect(f.events).toEqual([`start ${root} second`]);
  f.update('third');
  expect(f.events.slice(-2)).toEqual([
    `cleanup ${root} second`,
    `start ${root} third`,
  ]);
  f.push();
  f.update('fourth');
  const target = f.current();
  f.finish();
  expect(f.events.at(-1)).toBe(`start ${target} fourth`);
  f.unmount();
});

test('ordinary focus remains immediate and remains active while dismissing', () => {
  const f = fixture(false);
  f.present();
  const root = f.current();
  expect(f.events).toEqual([`start ${root} first`]);
  f.settle();
  f.push('avatar');
  expect(f.events).toHaveLength(1);
  f.prepare();
  const target = f.current();
  expect(f.events.slice(-2)).toEqual([
    `cleanup ${root} first`,
    `start ${target} first`,
  ]);
  f.dispatch({ type: 'dismiss' });
  expect(f.events.at(-1)).toBe(`start ${target} first`);
  f.settle(0);
  expect(f.events.at(-1)).toBe(`cleanup ${target} first`);
  f.unmount();
});

test('rechecks eligibility when another commit effect navigates before delivery', () => {
  const store = createTrayStateStore();
  store.dispatch({ type: 'present', name: 'form', params: undefined });
  store.dispatch({ type: 'settled', session: 1, index: 1 });
  const effect = jest.fn();
  function Navigate() {
    useLayoutEffect(() => {
      store.dispatch({ type: 'push', name: 'next', params: undefined });
    }, []);
    return null;
  }
  function Observer() {
    useTrayFocusEffect(store, '1', effect, { afterTransition: true });
    return null;
  }
  let renderer!: RenderResult;

  renderer = renderComponent(
    <>
      <Navigate />
      <Observer />
    </>
  );

  expect(effect).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('new observers on an already settled route run immediately and changes to options take effect', () => {
  const store = createTrayStateStore();
  store.dispatch({ type: 'present', name: 'form', params: undefined });
  const effect = jest.fn();
  const cleanup = jest.fn();
  effect.mockReturnValue(cleanup);
  function Observer({ options }: { options?: TrayFocusEffectOptions }) {
    useTrayFocusEffect(store, '1', effect, options);
    return null;
  }
  let renderer!: RenderResult;

  renderer = renderComponent(<Observer />);

  expect(effect).toHaveBeenCalledTimes(1);
  act(() =>
    renderer.rerender(<Observer options={{ afterTransition: true }} />)
  );
  expect(cleanup).toHaveBeenCalledTimes(1);
  act(() => {
    store.dispatch({ type: 'settled', session: 1, index: 1 });
  });
  expect(effect).toHaveBeenCalledTimes(2);
  act(() => renderer.unmount());

  renderer = renderComponent(<Observer options={{ afterTransition: true }} />);

  expect(effect).toHaveBeenCalledTimes(3);
  act(() => renderer.unmount());
});

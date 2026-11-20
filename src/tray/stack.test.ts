import { describeRouteChange, initialTrayState, trayReducer } from './stack';

const list = { name: 'item', key: 'list' };
const detail = { name: 'item', key: 'detail' };
const other = { name: 'item', key: 'another' };
const opening = trayReducer(initialTrayState, describeRouteChange([], [list]));
const open = trayReducer(opening, {
  type: 'settled',
  session: opening.session,
  index: 1,
});

test('queues Back and retains the outgoing route until its matching completion', () => {
  const push = trayReducer(open, describeRouteChange([list], [list, detail]));
  expect(push.entries).toEqual([list, detail]);
  const queued = trayReducer(push, describeRouteChange(push.entries, [list]));
  const finishPush = {
    type: 'transitionEnd',
    session: open.session,
    id: push.transition!.id,
  } as const;
  const back = trayReducer(queued, finishPush);
  expect(back.transition).toMatchObject({
    from: detail.key,
    to: list.key,
    direction: -1,
    retained: [detail],
  });
  expect(trayReducer(back, finishPush)).toBe(back);
  expect(
    trayReducer(back, { ...finishPush, id: back.transition!.id }).transition
  ).toBeUndefined();
});

test('retains replaced content through dismissal and ignores stale sheet settlement', () => {
  const replaced = trayReducer(open, describeRouteChange([list], [other]));
  expect(replaced.transition?.retained).toEqual([list]);
  const closing = trayReducer(replaced, { type: 'dismiss' });
  const closed = { type: 'settled', session: open.session, index: 0 } as const;
  expect(trayReducer(closing, { ...closed, session: open.session - 1 })).toBe(
    closing
  );
  expect(trayReducer(closing, closed).entries).toEqual([]);
});

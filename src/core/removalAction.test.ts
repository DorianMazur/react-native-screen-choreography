import { isSingleRouteBack } from './removalAction';

const state = {
  key: 'stack',
  index: 1,
  routes: [
    { key: 'list-1', name: 'List' },
    { key: 'detail-1', name: 'Detail' },
  ],
};

describe('removal action classification', () => {
  test.each([{ type: 'GO_BACK' }, { type: 'POP', payload: { count: 1 } }])(
    'animates a single return: $type',
    (action) => {
      expect(isSingleRouteBack(action, state, 'detail-1', 'List')).toBe(true);
    }
  );

  test.each([
    { type: 'RESET' },
    { type: 'REPLACE' },
    { type: 'POP_TO_TOP' },
    { type: 'POP', payload: { count: 2 } },
    { type: 'GO_BACK', target: 'parent-stack' },
    { type: 'GO_BACK', source: 'other-route' },
  ])('does not invent a return for $type', (action) => {
    expect(isSingleRouteBack(action, state, 'detail-1', 'List')).toBe(false);
  });

  test('rejects stale lineage and a non-top route', () => {
    expect(
      isSingleRouteBack({ type: 'GO_BACK' }, state, 'detail-1', 'Other')
    ).toBe(false);
    expect(
      isSingleRouteBack({ type: 'GO_BACK' }, state, 'list-1', 'List')
    ).toBe(false);
  });

  test.each([
    ['list-1', true],
    ['list-2', false],
    ['removed-list', false],
  ] as const)(
    'checks the selected tab by route key on Back to %s',
    (source, expected) => {
      const tabs = {
        key: 'tabs',
        name: 'Tabs',
        state: {
          index: 1,
          routes: [
            { key: 'list-2', name: 'List' },
            { key: 'list-1', name: 'List' },
          ],
        },
      };
      expect(
        isSingleRouteBack(
          { type: 'GO_BACK' },
          { ...state, routes: [tabs, { key: 'detail-1', name: 'Detail' }] },
          'detail-1',
          'List',
          source
        )
      ).toBe(expected);
    }
  );

  test('uses route identity when Expo route names differ from screen IDs', () => {
    expect(
      isSingleRouteBack(
        { type: 'GO_BACK' },
        state,
        'detail-1',
        'TokenList',
        'list-1'
      )
    ).toBe(true);
    expect(
      isSingleRouteBack(
        { type: 'GO_BACK' },
        state,
        'detail-1',
        'List',
        'old-list'
      )
    ).toBe(false);
  });
});

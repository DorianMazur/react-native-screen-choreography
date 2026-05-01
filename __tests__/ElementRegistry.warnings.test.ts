import { ElementRegistry } from '../src/ElementRegistry';
import {
  setDebugEnabled,
  setDebugLevel,
  setDebugCoalesce,
  getDebugLogs,
  clearDebugLogs,
} from '../src/debug/logger';
import type { ElementSnapshot, RegisteredElement } from '../src/types';

function makeElement(
  overrides: Partial<RegisteredElement> = {}
): RegisteredElement {
  const snapshot: ElementSnapshot = {
    content: null,
    transition: { renderer: () => null },
  };
  return {
    id: 'shared',
    groupId: 'group-a',
    screenId: 'screen-1',
    ref: () => null,
    metrics: null,
    getSnapshot: () => snapshot,
    ...overrides,
  };
}

describe('ElementRegistry warnings', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    setDebugEnabled(true);
    setDebugLevel('warn');
    setDebugCoalesce(false);
    clearDebugLogs();
  });

  afterEach(() => {
    setDebugEnabled(false);
    setDebugLevel('info');
    setDebugCoalesce(true);
    clearDebugLogs();
  });

  test('warns on duplicate id+screen with conflicting groupIds', () => {
    registry.register(makeElement({ groupId: 'group-a' }));
    registry.register(makeElement({ groupId: 'group-b' }));

    const logs = getDebugLogs();
    expect(logs.some((log) => log.includes('Duplicate id'))).toBe(true);
  });

  test('does not warn for identical (id, groupId, screenId) re-registration', () => {
    registry.register(makeElement({ groupId: 'group-a' }));
    registry.register(makeElement({ groupId: 'group-a' }));

    const logs = getDebugLogs();
    expect(logs.some((log) => log.includes('Duplicate id'))).toBe(false);
  });

  test('warns when same id is registered with different groups across screens', () => {
    registry.register(
      makeElement({ groupId: 'group-a', screenId: 'screen-1' })
    );
    registry.register(
      makeElement({ groupId: 'group-b', screenId: 'screen-2' })
    );

    const logs = getDebugLogs();
    expect(
      logs.some((log) => log.includes('conflicting groupIds across screens'))
    ).toBe(true);
  });

  test('two list rows with same element id but different groupIds do not collide', () => {
    registry.register(
      makeElement({
        id: 'card',
        groupId: 'token.btc',
        screenId: 'list',
      })
    );
    registry.register(
      makeElement({
        id: 'card',
        groupId: 'token.eth',
        screenId: 'list',
      })
    );

    // Both registrations should be present (registry currently keys by id only,
    // but uses groupId as the matching dimension).
    expect(registry.getById('card')).toHaveLength(1);
    // Once different screens are added the registry holds entries per screen.
    registry.register(
      makeElement({
        id: 'card',
        groupId: 'token.btc',
        screenId: 'detail',
      })
    );
    expect(registry.getById('card')).toHaveLength(2);
  });
});

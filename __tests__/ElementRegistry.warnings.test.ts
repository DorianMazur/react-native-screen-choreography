import { ElementRegistry } from '../src/core/ElementRegistry';
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

  test('allows the same id on one screen in different groups', () => {
    registry.register(makeElement({ groupId: 'group-a' }));
    registry.register(makeElement({ groupId: 'group-b' }));

    const logs = getDebugLogs();
    expect(logs.some((log) => log.includes('duplicate element'))).toBe(false);
    expect(registry.getById('shared')).toHaveLength(2);
  });

  test('warns for an exact compound identity re-registration', () => {
    registry.register(makeElement({ groupId: 'group-a' }));
    registry.register(makeElement({ groupId: 'group-a' }));

    const logs = getDebugLogs();
    expect(logs.some((log) => log.includes('duplicate element'))).toBe(true);
    expect(registry.getById('shared')).toHaveLength(1);
  });

  test('allows the same id in different groups across screens', () => {
    registry.register(
      makeElement({ groupId: 'group-a', screenId: 'screen-1' })
    );
    registry.register(
      makeElement({ groupId: 'group-b', screenId: 'screen-2' })
    );

    const logs = getDebugLogs();
    expect(logs.some((log) => log.includes('duplicate element'))).toBe(false);
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

    expect(registry.getById('card')).toHaveLength(2);
    registry.register(
      makeElement({
        id: 'card',
        groupId: 'token.btc',
        screenId: 'detail',
      })
    );
    expect(registry.getById('card')).toHaveLength(3);
    expect(
      registry.getByIdAndScreen('card', 'list', 'token.eth')?.groupId
    ).toBe('token.eth');
  });
});

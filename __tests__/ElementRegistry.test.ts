import { ElementRegistry } from '../src/ElementRegistry';
import type { RegisteredElement } from '../src/types';

function createMockElement(
  overrides: Partial<RegisteredElement> = {}
): RegisteredElement {
  return {
    id: 'test-element',
    groupId: 'test-group',
    screenId: 'screen-1',
    ref: () => null,
    config: {},
    metrics: null,
    ...overrides,
  };
}

describe('ElementRegistry', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
  });

  test('registers and retrieves an element', () => {
    const element = createMockElement();
    registry.register(element);

    const result = registry.getById('test-element');
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('test-element');
  });

  test('registers same id on different screens', () => {
    registry.register(createMockElement({ screenId: 'screen-1' }));
    registry.register(createMockElement({ screenId: 'screen-2' }));

    const result = registry.getById('test-element');
    expect(result).toHaveLength(2);
  });

  test('replaces registration for same id + screenId', () => {
    registry.register(createMockElement({ screenId: 'screen-1' }));
    registry.register(createMockElement({ screenId: 'screen-1' }));

    const result = registry.getById('test-element');
    expect(result).toHaveLength(1);
  });

  test('unregisters an element', () => {
    registry.register(createMockElement());
    registry.unregister('test-element', 'screen-1');

    const result = registry.getById('test-element');
    expect(result).toHaveLength(0);
  });

  test('unregister only removes the matching screen', () => {
    registry.register(createMockElement({ screenId: 'screen-1' }));
    registry.register(createMockElement({ screenId: 'screen-2' }));

    registry.unregister('test-element', 'screen-1');

    const result = registry.getById('test-element');
    expect(result).toHaveLength(1);
    expect(result[0]?.screenId).toBe('screen-2');
  });

  test('getByIdAndScreen returns correct element', () => {
    registry.register(createMockElement({ screenId: 'screen-1' }));
    registry.register(createMockElement({ screenId: 'screen-2' }));

    const result = registry.getByIdAndScreen('test-element', 'screen-2');
    expect(result).toBeDefined();
    expect(result?.screenId).toBe('screen-2');
  });

  test('getByIdAndScreen returns undefined for missing', () => {
    const result = registry.getByIdAndScreen('missing', 'screen-1');
    expect(result).toBeUndefined();
  });

  test('getGroupElements returns elements for group+screen', () => {
    registry.register(
      createMockElement({ id: 'a', groupId: 'group-1', screenId: 'screen-1' })
    );
    registry.register(
      createMockElement({ id: 'b', groupId: 'group-1', screenId: 'screen-1' })
    );
    registry.register(
      createMockElement({ id: 'c', groupId: 'group-2', screenId: 'screen-1' })
    );
    registry.register(
      createMockElement({ id: 'a', groupId: 'group-1', screenId: 'screen-2' })
    );

    const result = registry.getGroupElements('group-1', 'screen-1');
    expect(result).toHaveLength(2);
  });

  test('getGroupElementIds returns unique ids across screens', () => {
    registry.register(
      createMockElement({ id: 'a', groupId: 'group-1', screenId: 'screen-1' })
    );
    registry.register(
      createMockElement({ id: 'b', groupId: 'group-1', screenId: 'screen-1' })
    );
    registry.register(
      createMockElement({ id: 'a', groupId: 'group-1', screenId: 'screen-2' })
    );

    const result = registry.getGroupElementIds('group-1');
    expect(result).toHaveLength(2);
    expect(result).toContain('a');
    expect(result).toContain('b');
  });

  test('updateMetrics updates cached metrics', () => {
    registry.register(createMockElement());
    registry.updateMetrics('test-element', 'screen-1', {
      pageX: 10,
      pageY: 20,
      width: 100,
      height: 50,
    });

    const element = registry.getByIdAndScreen('test-element', 'screen-1');
    expect(element?.metrics).toEqual({
      pageX: 10,
      pageY: 20,
      width: 100,
      height: 50,
    });
  });

  test('size returns total count of registrations', () => {
    registry.register(createMockElement({ id: 'a', screenId: 'screen-1' }));
    registry.register(createMockElement({ id: 'a', screenId: 'screen-2' }));
    registry.register(createMockElement({ id: 'b', screenId: 'screen-1' }));

    expect(registry.size).toBe(3);
  });

  test('clear removes all registrations', () => {
    registry.register(createMockElement({ id: 'a' }));
    registry.register(createMockElement({ id: 'b' }));
    registry.clear();

    expect(registry.size).toBe(0);
  });

  test('getDebugSnapshot returns correct data', () => {
    registry.register(
      createMockElement({ id: 'a', groupId: 'g1', screenId: 's1' })
    );
    const snapshot = registry.getDebugSnapshot();

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toEqual({
      id: 'a',
      screenId: 's1',
      groupId: 'g1',
      hasMetrics: false,
    });
  });
});

import { ElementRegistry } from './ElementRegistry';
import { setDebugEnabled } from '../debug/logger';
import type { RegisteredElement } from '../types';

function element(
  screenId: string,
  groupId: string | undefined,
  id = 'card'
): RegisteredElement {
  return {
    id,
    screenId,
    groupId,
    ref: { current: null },
    metrics: null,
    getPresentation: () => ({ transition: { renderer: () => null } }),
  };
}

test('replaces only an exact registration and warns about the collision', () => {
  const registry = new ElementRegistry();
  const row = element('list', 'first');
  const otherRow = element('list', 'second');
  const detail = element('detail', 'first');
  const replacement = element('list', 'first');
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  setDebugEnabled(true);
  try {
    registry.register(row);
    registry.register(otherRow);
    registry.register(detail);
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('duplicate'));

    registry.register(replacement);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('duplicate'));
    expect(registry.getByIdAndScreen('card', 'list', 'first')?.ref).toBe(
      replacement.ref
    );
    expect(registry.getByIdAndScreen('card', 'list', 'second')?.ref).toBe(
      otherRow.ref
    );
    expect(registry.getByIdAndScreen('card', 'detail', 'first')?.ref).toBe(
      detail.ref
    );
  } finally {
    setDebugEnabled(false);
    log.mockRestore();
  }
});

test('unregistering an ungrouped owner preserves its grouped and off-screen peers', () => {
  const registry = new ElementRegistry();
  const grouped = element('list', 'row');
  const otherScreen = element('detail', undefined);
  registry.register(element('list', undefined));
  registry.register(grouped);
  registry.register(otherScreen);

  registry.unregister('card', 'list', undefined);
  expect(registry.getByIdAndScreen('card', 'list', undefined)).toBeUndefined();
  expect(registry.getByIdAndScreen('card', 'list', 'row')?.ref).toBe(
    grouped.ref
  );
  expect(registry.getByIdAndScreen('card', 'detail', undefined)?.ref).toBe(
    otherScreen.ref
  );
});

test('source capture and pair discovery see only the requested screen and group', () => {
  const registry = new ElementRegistry();
  const hero = element('list', 'row', 'hero');
  const title = element('list', 'row', 'title');
  registry.register(hero);
  registry.register(title);
  registry.register(element('detail', 'row', 'detail-only'));
  registry.register(element('list', 'other', 'other-row'));

  expect(registry.getGroupElements('row', 'list')).toEqual([hero, title]);
  expect(registry.getGroupElementIds('row', 'list')).toEqual(['hero', 'title']);
});

test('subscribers see committed registrations and removals until they unsubscribe', () => {
  const registry = new ElementRegistry();
  const card = element('list', 'row');
  const observed: (RegisteredElement | undefined)[] = [];
  const unsubscribe = registry.subscribe(() => {
    observed.push(registry.getByIdAndScreen('card', 'list', 'row'));
  });

  registry.register(card);
  registry.unregister('card', 'list', 'row');
  unsubscribe();
  registry.register(card);
  expect(observed).toEqual([card, undefined]);
});

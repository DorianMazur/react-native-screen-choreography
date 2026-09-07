import { scheduleOnUI } from 'react-native-worklets';
import { ElementVisibilityRegistry } from './ElementVisibilityRegistry';

jest.mock('react-native-worklets', () => ({ scheduleOnUI: jest.fn() }));

const scheduled = jest.mocked(scheduleOnUI);

function flushUpdates() {
  const calls = [...scheduled.mock.calls];
  scheduled.mockClear();
  for (const [worklet, ...args] of calls) {
    (worklet as (...values: unknown[]) => void)(...args);
  }
}

beforeEach(() => scheduled.mockClear());

test('batches only changed entries without reading shared values', () => {
  const visibility = new ElementVisibilityRegistry();
  const source = visibility.get('source', false);
  const target = visibility.get('target', false);
  const sourceWrite = jest.fn();
  const targetWrite = jest.fn();
  for (const [value, write] of [
    [source, sourceWrite],
    [target, targetWrite],
  ] as const) {
    Object.defineProperty(value, 'value', {
      get: () => {
        throw new Error('Visibility must not read shared values on JS');
      },
      set: write,
    });
  }
  for (let index = 0; index < 100; index += 1) {
    visibility.get(`unrelated-${index}`, false);
  }

  visibility.sync(new Set(['source', 'target']));
  visibility.sync(new Set(['source', 'target']));
  expect(scheduled).toHaveBeenCalledTimes(1);
  expect(scheduled.mock.calls[0]![1]).toHaveLength(2);
  expect(sourceWrite).not.toHaveBeenCalled();
  flushUpdates();
  expect(sourceWrite).toHaveBeenCalledTimes(1);
  expect(sourceWrite).toHaveBeenCalledWith(1);
  expect(targetWrite).toHaveBeenCalledTimes(1);
  expect(targetWrite).toHaveBeenCalledWith(1);
});

test('preserves queued hide, cancellation, and replacement order', () => {
  const visibility = new ElementVisibilityRegistry();
  const value = visibility.get('card', false);
  visibility.sync(new Set(['card']));
  visibility.sync(new Set());
  visibility.sync(new Set(['card']));
  expect(scheduled).toHaveBeenCalledTimes(3);
  expect(visibility.get('card', false)).toBe(value);
  flushUpdates();
  expect(value.value).toBe(1);

  visibility.clear();
  visibility.clear();
  expect(scheduled).toHaveBeenCalledTimes(1);
  flushUpdates();
  expect(value.value).toBe(0);
});

test('initializes hidden remounts and independently releases old entries', () => {
  const visibility = new ElementVisibilityRegistry();
  const previous = visibility.get('card', true);
  visibility.sync(new Set(['card']));
  expect(scheduled).not.toHaveBeenCalled();
  visibility.delete('card');
  const replacement = visibility.get('card', true);
  expect(replacement).not.toBe(previous);
  flushUpdates();
  expect(previous.value).toBe(0);
  expect(replacement.value).toBe(1);
  visibility.clear();
  flushUpdates();
  expect(replacement.value).toBe(0);

  visibility.get('visible', false);
  visibility.delete('visible');
  visibility.delete('missing');
  expect(scheduled).not.toHaveBeenCalled();
});

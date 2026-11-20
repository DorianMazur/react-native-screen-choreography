import React from 'react';
import {
  act,
  render as renderComponent,
  type RenderResult,
} from '@testing-library/react-native/pure';
import type { KeyboardHandler } from 'react-native-keyboard-controller';
import { useTrayKeyboard } from './useTrayKeyboard';

let mockInitialHeight = 0;
let mockDeferCallbacks = false;
const mockCallbacks: Array<() => void> = [];
const mockHandlers = new Set<{ current: KeyboardHandler }>();

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardController: {
    isVisible: () => mockInitialHeight > 0,
    state: () => ({ height: mockInitialHeight }),
  },
  useKeyboardHandler: (handlers: KeyboardHandler) => {
    const { useEffect, useRef } = jest.requireActual<typeof React>('react');
    const ref = useRef(handlers);
    ref.current = handlers;
    useEffect(() => {
      mockHandlers.add(ref);
      return () => {
        mockHandlers.delete(ref);
      };
    }, []);
  },
}));
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (fn: () => void) => fn(),
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => {
    if (mockDeferCallbacks) mockCallbacks.push(() => fn(...args));
    else fn(...args);
  },
}));
jest.mock('@swmansion/react-native-bottom-sheet', () => ({
  BottomSheetProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  ModalBottomSheet: 'BottomSheet',
}));

const renderers: RenderResult[] = [];
const event = { height: 300, progress: 1, duration: 250, target: 1 };

function render(element: React.ReactElement) {
  let renderer!: RenderResult;

  renderer = renderComponent(element);

  renderers.push(renderer);
  return renderer;
}

function keyboardFixture() {
  let keyboard!: ReturnType<typeof useTrayKeyboard>;
  const renders = jest.fn();
  function Observer() {
    keyboard = useTrayKeyboard();
    renders();
    return null;
  }
  const renderer = render(<Observer />);
  const handlers = [...mockHandlers].at(-1)!;
  return { renderer, handlers, renders, read: () => keyboard };
}

beforeEach(() => {
  mockInitialHeight = 0;
  mockDeferCallbacks = false;
  mockCallbacks.length = 0;
});

afterEach(() => {
  act(() => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
  expect(mockHandlers.size).toBe(0);
});

test('hides companion accessibility from opening until closing settles without rendering each frame', () => {
  const f = keyboardFixture();
  const { height, progress } = f.read();
  expect(f.read().isVisible).toBe(false);
  act(() => f.handlers.current.onStart!(event));
  expect(f.read().isVisible).toBe(true);
  expect(height.value).toBe(0);
  const openingRenders = f.renders.mock.calls.length;
  for (const value of [75, 150, 225, 300]) {
    act(() =>
      f.handlers.current.onMove!({
        ...event,
        height: value,
        progress: value / 300,
      })
    );
    expect(height.value).toBe(value);
    expect(progress.value).toBe(value / 300);
  }
  expect(f.renders).toHaveBeenCalledTimes(openingRenders);
  act(() => f.handlers.current.onEnd!(event));
  expect(f.read().layoutHeight).toBe(300);
  act(() => f.handlers.current.onStart!({ ...event, height: 0, progress: 0 }));
  expect(f.read().layoutHeight).toBe(0);
  expect(f.read().isVisible).toBe(true);
  const closingRenders = f.renders.mock.calls.length;
  for (const value of [225, 150, 75, 0]) {
    act(() =>
      f.handlers.current.onMove!({
        ...event,
        height: value,
        progress: value / 300,
      })
    );
    expect(f.read().isVisible).toBe(true);
  }
  expect(f.renders).toHaveBeenCalledTimes(closingRenders);
  act(() => f.handlers.current.onEnd!({ ...event, height: 0, progress: 0 }));
  expect(f.read().isVisible).toBe(false);
  expect(f.read().height).toBe(height);
  expect(f.read().progress).toBe(progress);
});

test('initializes an open keyboard and follows interactive cancellation and height changes', () => {
  mockInitialHeight = 300;
  const f = keyboardFixture();
  expect(f.read()).toMatchObject({
    isVisible: true,
    layoutHeight: 300,
    height: { value: 300 },
    progress: { value: 1 },
  });
  const initialRenders = f.renders.mock.calls.length;
  for (const value of [150, 75, 225, 300]) {
    act(() =>
      f.handlers.current.onInteractive!({
        ...event,
        height: value,
        progress: value / 300,
      })
    );
    expect(f.read().isVisible).toBe(true);
    expect(f.read().height.value).toBe(value);
  }
  expect(f.renders).toHaveBeenCalledTimes(initialRenders);
  act(() =>
    f.handlers.current.onMove!({ ...event, height: 340, progress: 1.2 })
  );
  expect(f.read().height.value).toBe(340);
  expect(f.read().progress.value).toBe(1);
  act(() => f.handlers.current.onEnd!({ ...event, height: 340 }));
  expect(f.read().layoutHeight).toBe(340);
  act(() =>
    f.handlers.current.onInteractive!({ ...event, height: -1, progress: -0.1 })
  );
  expect(f.read().isVisible).toBe(false);
  expect(f.read().height.value).toBe(0);
  expect(f.read().progress.value).toBe(0);
  act(() =>
    f.handlers.current.onInteractive!({ ...event, height: 170, progress: 0.5 })
  );
  expect(f.read().isVisible).toBe(true);
});

test('ignores deferred callbacks after the owning presentation unmounts', () => {
  mockDeferCallbacks = true;
  const old = keyboardFixture();
  act(() => old.handlers.current.onStart!(event));
  act(() => old.handlers.current.onEnd!(event));
  expect(mockCallbacks.length).toBeGreaterThan(0);
  act(() => old.renderer.unmount());
  const current = keyboardFixture();
  const currentRenders = current.renders.mock.calls.length;
  act(() => {
    for (const callback of mockCallbacks.splice(0)) callback();
  });
  expect(current.read()).toMatchObject({
    isVisible: false,
    layoutHeight: 0,
    height: { value: 0 },
    progress: { value: 0 },
  });
  expect(current.renders).toHaveBeenCalledTimes(currentRenders);
});

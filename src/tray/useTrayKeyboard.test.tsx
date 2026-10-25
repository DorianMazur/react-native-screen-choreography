import React from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import type { KeyboardHandler } from 'react-native-keyboard-controller';
import { createTray } from './createTray';
import { useTrayKeyboard } from './useTrayKeyboard';
import type { TrayKeyboardState, TrayNavigation } from './types';

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
jest.mock('react-native-teleport', () => ({
  PortalProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../native/NativeTransitionHost', () => ({
  NativeTransitionHost: 'TransitionHost',
}));
jest.mock('../native/NativeChoreographyPreparation', () => ({
  __esModule: true,
  default: { install: jest.fn() },
}));
jest.mock('@swmansion/react-native-bottom-sheet', () => ({
  BottomSheetProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  ModalBottomSheet: 'BottomSheet',
}));
jest.mock('../components/ChoreographyOverlay', () => ({
  ChoreographyOverlay: 'Overlay',
}));

const renderers: TestRenderer.ReactTestRenderer[] = [];
const event = { height: 300, progress: 1, duration: 250, target: 1 };

function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
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

test('shares the host keyboard values with screen and header consumers without per-frame React updates', async () => {
  const Tray = createTray<{ form: undefined }>();
  let navigation!: TrayNavigation<{ form: undefined }>;
  let pageKeyboard!: TrayKeyboardState;
  let headerKeyboard!: TrayKeyboardState;
  const pageRenders = jest.fn();
  function Actions() {
    navigation = Tray.useTray();
    return null;
  }
  function Form() {
    pageKeyboard = Tray.useKeyboard();
    pageRenders();
    return <View />;
  }
  function Header() {
    headerKeyboard = Tray.useKeyboard();
    return <View />;
  }
  const renderer = render(
    <Tray.Provider>
      <Actions />
      <Tray.Stack renderHeader={() => <Header />}>
        <Tray.Screen name="form" component={Form} />
      </Tray.Stack>
    </Tray.Provider>
  );
  await act(async () => navigation.present('form'));
  expect(pageKeyboard).toBe(headerKeyboard);
  expect(Object.keys(pageKeyboard).sort()).toEqual([
    'height',
    'isVisible',
    'progress',
  ]);
  const values = pageKeyboard;
  const handlers = [...mockHandlers][0]!;
  act(() => handlers.current.onStart!(event));
  expect(pageKeyboard.isVisible).toBe(true);
  const renders = pageRenders.mock.calls.length;
  act(() => handlers.current.onMove!({ ...event, height: 150, progress: 0.5 }));
  expect(pageKeyboard.height).toBe(values.height);
  expect(pageKeyboard.progress).toBe(values.progress);
  expect(pageKeyboard.height.value).toBe(150);
  expect(pageKeyboard.progress.value).toBe(0.5);
  expect(pageRenders).toHaveBeenCalledTimes(renders);
  act(() => handlers.current.onEnd!(event));
  const sheet = renderer.root.findByType('BottomSheet' as React.ElementType);
  expect(StyleSheet.flatten(sheet.props.style).bottom).toBe(
    pageKeyboard.height.value
  );
});

test('rejects keyboard access outside its own screen, including nested provider app content', () => {
  const Tray = createTray<{ form: undefined }>();
  const Other = createTray<{ form: undefined }>();
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  let navigation!: TrayNavigation<{ form: undefined }>;
  function Actions() {
    navigation = Tray.useTray();
    return null;
  }
  function ReadKeyboard() {
    Tray.useKeyboard();
    return null;
  }
  function ReadOtherKeyboard() {
    Other.useKeyboard();
    return null;
  }
  function Empty() {
    return null;
  }
  function Nested() {
    return (
      <Tray.Provider>
        <ReadKeyboard />
        <Tray.Stack>
          <Tray.Screen name="form" component={Empty} />
        </Tray.Stack>
      </Tray.Provider>
    );
  }
  try {
    expect(() => render(<ReadKeyboard />)).toThrow(
      'useKeyboard must be used inside a screen or custom header of its Tray.Provider.'
    );
    for (const component of [ReadOtherKeyboard, Nested]) {
      render(
        <Tray.Provider>
          <Actions />
          <Tray.Stack>
            <Tray.Screen name="form" component={component} />
          </Tray.Stack>
        </Tray.Provider>
      );
      expect(() => act(() => navigation.present('form'))).toThrow(
        'useKeyboard must be used inside a screen or custom header of its Tray.Provider.'
      );
    }
  } finally {
    error.mockRestore();
  }
});

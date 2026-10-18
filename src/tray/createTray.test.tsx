import React, { createContext, useContext, useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { createTray } from './createTray';
import { useTrayKeyboard } from './useTrayKeyboard';
import type { KeyboardHandler } from 'react-native-keyboard-controller';
import type { TrayNavigation, TrayScreenProps, TrayState } from './types';

const mockCompletions: Array<(finished: boolean) => void> = [];
jest.mock('react-native-reanimated', () => {
  const animate = (
    value: number,
    _config: unknown,
    complete?: (finished: boolean) => void
  ) => {
    if (complete) mockCompletions.push(complete);
    return value;
  };
  return {
    ...jest.requireActual('../../__mocks__/react-native-reanimated'),
    ReduceMotion: { System: 'system' },
    withTiming: animate,
    withSpring: animate,
  };
});
let mockKeyboardHandlers: KeyboardHandler;
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardController: {
    isVisible: () => false,
    state: () => ({ height: 0 }),
  },
  useKeyboardHandler: (handlers: KeyboardHandler) => {
    mockKeyboardHandlers = handlers;
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
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (fn: () => void) => fn(),
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    fn(...args),
}));
jest.mock('@swmansion/react-native-bottom-sheet', () => ({
  BottomSheetProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  ModalBottomSheet: 'BottomSheet',
}));
jest.mock('../components/ChoreographyOverlay', () => ({
  ChoreographyOverlay: 'Overlay',
}));

type Routes = { form: undefined; preview: { label: string } };
const Tray = createTray<Routes>();
export function checkDeclarationTypes() {
  // @ts-expect-error Unknown route names are rejected.
  <Tray.Screen name="missing" component={Form} />;
  // @ts-expect-error A preview component cannot be registered for form params.
  <Tray.Screen name="form" component={Preview} />;
  // @ts-expect-error A screen declaration must supply its component.
  <Tray.Screen name="form" />;
  <Tray.Screen
    name="form"
    component={Form}
    // @ts-expect-error Only supported presentations are accepted.
    options={{ presentation: 'modal' }}
  />;
}
let navigation: TrayNavigation<Routes>;
let navigationState: TrayState<Routes>;
const unmounted: string[] = [];
function Observer() {
  navigation = Tray.useTray();
  navigationState = Tray.useTrayState((state) => state);
  return null;
}
function Form() {
  const [text, setText] = useState('draft');
  useEffect(
    () => () => {
      unmounted.push('form');
    },
    []
  );
  return <TextInput testID="draft" value={text} onChangeText={setText} />;
}
function Preview({ route }: TrayScreenProps<Routes, 'preview'>) {
  useEffect(
    () => () => {
      unmounted.push(route.key);
    },
    [route.key]
  );
  return <View testID={route.key} />;
}
function stack(Definition = Tray, onDismiss?: () => void) {
  return (
    <Definition.Stack onDismiss={onDismiss}>
      <Definition.Screen
        name="form"
        component={Form}
        options={{ title: 'Form' }}
      />
      <Definition.Screen
        name="preview"
        component={Preview}
        options={{ title: 'Preview' }}
      />
    </Definition.Stack>
  );
}
function sheet(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByType('BottomSheet' as React.ElementType);
}

beforeEach(() => {
  mockCompletions.length = 0;
  unmounted.length = 0;
});

test('isolates screen content from navigation and layout updates while preserving local state and context updates', () => {
  const ValueContext = createContext('initial');
  const renders = jest.fn();
  const actionsRendered = jest.fn();
  function Actions() {
    actionsRendered(Tray.useTray());
    return null;
  }
  function Content({ route, tray }: TrayScreenProps<Routes, 'form'>) {
    const actions = Tray.useTray();
    const value = useContext(ValueContext);
    const [text, setText] = useState('draft');
    renders({ route, tray, actions, value, text });
    return <TextInput value={text} onChangeText={setText} />;
  }
  const actions = <Actions />;
  const render = (value = 'initial', title = 'Form') => (
    <ValueContext.Provider value={value}>
      <Tray.Provider>
        <Observer />
        {actions}
        <Tray.Stack>
          <Tray.Screen name="form" component={Content} options={{ title }} />
          <Tray.Screen name="preview" component={Preview} />
        </Tray.Stack>
      </Tray.Provider>
    </ValueContext.Provider>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(render());
  });
  const originalActions = navigation;
  act(() => navigation.present('form'));
  const originalRoute = renders.mock.calls[0]![0].route;
  act(() => sheet(renderer).props.onSettle(1));
  const content = sheet(renderer)
    .findAllByType(View)
    .find((view) => typeof view.props.onLayout === 'function')!;
  act(() =>
    content.props.onLayout({ nativeEvent: { layout: { height: 200 } } })
  );
  act(() => navigation.push('preview', { label: 'next' }));
  act(() => mockCompletions.shift()!(true));
  act(() => renderer.update(render('initial', 'Updated title')));
  expect(renders).toHaveBeenCalledTimes(1);
  expect(actionsRendered).toHaveBeenCalledTimes(1);
  expect(navigation).toBe(originalActions);

  act(() => renderer.root.findByType(TextInput).props.onChangeText('edited'));
  expect(renders).toHaveBeenCalledTimes(2);
  act(() => renderer.update(render('updated')));
  expect(renders).toHaveBeenCalledTimes(3);
  expect(renders).toHaveBeenLastCalledWith({
    route: originalRoute,
    tray: originalActions,
    actions: originalActions,
    value: 'updated',
    text: 'edited',
  });
  act(() => navigation.back());
  act(() => mockCompletions.shift()!(true));
  expect(renderer.root.findByType(TextInput).props.value).toBe('edited');
  act(() => navigation.dismiss());
  expect(renders).toHaveBeenCalledTimes(3);
  expect(actionsRendered).toHaveBeenCalledTimes(1);
  act(() => sheet(renderer).props.onSettle(0));
  expect(renderer.root.findAllByType(Content)).toHaveLength(0);
  expect(actionsRendered).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('notifies state consumers only when their selection changes', () => {
  const presented = jest.fn();
  const depth = jest.fn();
  const route = jest.fn();
  function Presented() {
    presented(Tray.useTrayState((state) => state.isPresented));
    return null;
  }
  function Depth() {
    depth(Tray.useTrayState((state) => state.depth));
    return null;
  }
  function Route() {
    route(Tray.useTrayState((state) => state.route));
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Presented />
        <Depth />
        <Route />
        {stack()}
      </Tray.Provider>
    );
  });
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  expect(presented.mock.calls).toEqual([[false], [true]]);
  expect(depth.mock.calls).toEqual([[0], [1]]);
  expect(route).toHaveBeenCalledTimes(2);

  act(() => navigation.push('preview', { label: 'first' }));
  act(() => mockCompletions.shift()!(true));
  const previousRoute = navigationState.route;
  act(() => navigation.replace('preview', { label: 'replacement' }));
  act(() => mockCompletions.shift()!(true));
  expect(presented).toHaveBeenCalledTimes(2);
  expect(depth.mock.calls).toEqual([[0], [1], [2]]);
  expect(route).toHaveBeenCalledTimes(4);
  expect(route).toHaveBeenLastCalledWith(navigationState.route);
  expect(navigationState.route).not.toBe(previousRoute);
  expect(navigationState.route?.params).toEqual({ label: 'replacement' });

  act(() => navigation.back());
  act(() => mockCompletions.shift()!(true));
  act(() => navigation.dismiss());
  expect(presented).toHaveBeenCalledTimes(2);
  expect(depth.mock.calls).toEqual([[0], [1], [2], [1]]);
  expect(route).toHaveBeenCalledTimes(5);
  act(() => sheet(renderer).props.onSettle(0));
  expect(presented.mock.calls).toEqual([[false], [true], [false]]);
  expect(depth.mock.calls).toEqual([[0], [1], [2], [1], [0]]);
  expect(route).toHaveBeenCalledTimes(6);
  expect(route).toHaveBeenLastCalledWith(undefined);
  act(() => renderer.unmount());
});

test('caches object selections, accepts changed selectors, and unsubscribes removed consumers', () => {
  const selected = jest.fn();
  function Selection({ field }: { field: 'depth' | 'isPresented' }) {
    selected(Tray.useTrayState((state) => ({ value: state[field] })));
    return null;
  }
  const render = (field?: 'depth' | 'isPresented') => (
    <Tray.Provider>
      <Observer />
      {field && <Selection field={field} />}
      {stack()}
    </Tray.Provider>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(render('depth'));
  });
  expect(selected).toHaveBeenLastCalledWith({ value: 0 });
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  expect(selected).toHaveBeenLastCalledWith({ value: 1 });
  act(() => renderer.update(render('isPresented')));
  expect(selected).toHaveBeenLastCalledWith({ value: true });
  act(() => renderer.update(render()));
  selected.mockClear();
  act(() => navigation.dismiss());
  act(() => sheet(renderer).props.onSettle(0));
  expect(selected).not.toHaveBeenCalled();
  act(() => renderer.unmount());
});

test('screen subscriptions read the current stack on mount and keep updating behind the memo boundary', () => {
  const rendered = jest.fn();
  function SubscribedForm() {
    rendered(Tray.useTrayState((state) => state.depth));
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Tray.Stack>
          <Tray.Screen name="form" component={SubscribedForm} />
          <Tray.Screen name="preview" component={Preview} />
        </Tray.Stack>
      </Tray.Provider>
    );
  });
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  expect(rendered.mock.calls).toEqual([[1]]);
  act(() => navigation.push('preview', { label: 'next' }));
  act(() => mockCompletions.shift()!(true));
  expect(rendered.mock.calls).toEqual([[1], [2]]);
  act(() => navigation.back());
  act(() => mockCompletions.shift()!(true));
  expect(rendered.mock.calls).toEqual([[1], [2], [1]]);
  act(() => renderer.unmount());
});

test('custom stack icons preserve Back and Close actions and accessibility', () => {
  const backIcon = jest.fn(({ color, size }) => (
    <View
      testID="custom-back"
      style={{ backgroundColor: color, width: size, height: size }}
    />
  ));
  const closeIcon = jest.fn(() => <View testID="custom-close" />);
  const onDismiss = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Tray.Stack
          textColor="#123456"
          renderBackIcon={backIcon}
          renderCloseIcon={closeIcon}
          onDismiss={onDismiss}
        >
          <Tray.Screen name="form" component={Form} />
          <Tray.Screen name="preview" component={Preview} />
        </Tray.Stack>
      </Tray.Provider>
    );
  });
  const button = (label: string) =>
    renderer.root.findAll(
      (n) =>
        n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function'
    )[0]!;
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  expect(backIcon).toHaveBeenLastCalledWith({ color: '#123456', size: 24 });
  expect(closeIcon).toHaveBeenLastCalledWith({ color: '#123456', size: 24 });
  expect(button('Back in tray').props.disabled).toBe(true);
  expect(button('Back in tray').props.accessibilityElementsHidden).toBe(true);
  act(() => navigation.push('preview', { label: 'next' }));
  act(() => mockCompletions.shift()!(true));
  expect(
    renderer.root
      .findAllByProps({ testID: 'custom-back' })
      .filter((n) => n.type === View)
  ).toHaveLength(1);
  expect(button('Back in tray').props.disabled).toBe(false);
  act(() => button('Back in tray').props.onPress());
  expect(navigationState.route?.name).toBe('form');
  act(() => mockCompletions.shift()!(true));
  act(() => button('Close tray').props.onPress());
  expect(sheet(renderer).props.index).toBe(0);
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => sheet(renderer).props.onSettle(0));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('keeps the outgoing title until settlement while exposing only the current heading', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        {stack()}
      </Tray.Provider>
    );
  });
  const headings = () =>
    renderer.root
      .findAllByType(Text)
      .filter((node) => node.props.accessibilityRole === 'header')
      .map((node) => node.props.children);
  const outgoing = () =>
    renderer.root
      .findAllByType(Text)
      .filter((node) => node.props.accessibilityElementsHidden)
      .map((node) => node.props.children);
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  act(() => navigation.push('preview', { label: 'next' }));
  expect(headings()).toEqual(['Preview']);
  expect(outgoing()).toEqual(['Form']);
  const forwardComplete = mockCompletions.shift()!;
  act(() => forwardComplete(true));
  expect(outgoing()).toEqual([]);

  act(() => navigation.back());
  expect(headings()).toEqual(['Form']);
  expect(outgoing()).toEqual(['Preview']);
  act(() => forwardComplete(true));
  expect(outgoing()).toEqual(['Preview']);
  act(() => mockCompletions.shift()!(true));
  expect(outgoing()).toEqual([]);

  act(() => navigation.replace('preview', { label: 'root' }));
  expect(headings()).toEqual(['Preview']);
  expect(outgoing()).toEqual(['Form']);
  act(() => mockCompletions.shift()!(true));
  expect(outgoing()).toEqual([]);
  act(() => renderer.unmount());
});

test('ignores invalid measurements and keeps a stable viewport while resizing', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        {stack()}
      </Tray.Provider>
    );
  });
  act(() => navigation.present('form'));
  const content = () =>
    sheet(renderer)
      .findAllByType(View)
      .find((view) => typeof view.props.onLayout === 'function')!;
  const layout = (height: number) =>
    act(() =>
      content().props.onLayout({ nativeEvent: { layout: { height } } })
    );

  const card = () => StyleSheet.flatten(content().parent!.parent!.props.style);
  layout(0);
  layout(NaN);
  expect(card().height).toBeUndefined();
  layout(200);
  const viewportHeight = StyleSheet.flatten(
    content().parent!.props.style
  ).height;
  expect(viewportHeight).toBeGreaterThan(200);
  expect(card().height).toBe(200);

  act(() => sheet(renderer).props.onSettle(1));
  act(() => navigation.push('preview', { label: 'tall page' }));
  layout(500);
  layout(500.2);
  expect(StyleSheet.flatten(content().parent!.props.style).height).toBe(
    viewportHeight
  );
  act(() => mockCompletions.shift()!(true));
  expect(card().height).toBe(500);
  expect(StyleSheet.flatten(content().parent!.props.style).height).toBe(
    viewportHeight
  );
  act(() => renderer.unmount());
});

test('keyboard frames update shared geometry without rerendering React content', () => {
  let keyboard!: ReturnType<typeof useTrayKeyboard>;
  const renders = jest.fn();
  function KeyboardObserver() {
    keyboard = useTrayKeyboard();
    renders();
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<KeyboardObserver />);
  });
  const frames = renders.mock.calls.length;
  const event = { height: 150, progress: 0.5, duration: 250, target: 1 };
  act(() => mockKeyboardHandlers.onMove!(event));
  expect(keyboard.height.value).toBe(150);
  expect(keyboard.progress.value).toBe(0.5);
  expect(keyboard.layoutHeight).toBe(0);
  act(() =>
    mockKeyboardHandlers.onInteractive!({
      ...event,
      height: 75,
      progress: 0.25,
    })
  );
  expect(keyboard.height.value).toBe(75);
  expect(renders).toHaveBeenCalledTimes(frames);
  act(() =>
    mockKeyboardHandlers.onEnd!({ ...event, height: 300, progress: 1 })
  );
  expect(keyboard.layoutHeight).toBe(300);
  act(() =>
    mockKeyboardHandlers.onStart!({ ...event, height: 0, progress: 0 })
  );
  expect(keyboard.layoutHeight).toBe(0);
  expect(keyboard.height.value).toBe(300);
  act(() => mockKeyboardHandlers.onEnd!({ ...event, height: 0, progress: 0 }));
  expect(keyboard.layoutHeight).toBe(0);
  expect(keyboard.height.value).toBe(0);
  act(() => renderer.unmount());
});

test.each(['floating', 'sheet', 'fullScreen'] as const)(
  'replaces the bottom safe area with the keyboard edge for %s',
  (mode) => {
    const dimensions = {
      window: Dimensions.get('window'),
      screen: Dimensions.get('screen'),
    };
    Dimensions.set({
      window: { ...dimensions.window, height: 800 },
      screen: { ...dimensions.screen, height: 800 },
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      act(() => {
        renderer = TestRenderer.create(
          <Tray.Provider>
            <Observer />
            <Tray.Stack
              appearance={mode === 'sheet' ? 'sheet' : 'floating'}
              topInset={50}
              bottomInset={20}
            >
              <Tray.Screen
                name="form"
                component={Form}
                options={{
                  presentation: mode === 'fullScreen' ? 'fullScreen' : 'tray',
                }}
              />
            </Tray.Stack>
          </Tray.Provider>
        );
      });
      act(() => navigation.present('form'));
      const content = () =>
        sheet(renderer)
          .findAllByType(View)
          .find((view) => typeof view.props.onLayout === 'function')!;
      const card = () =>
        StyleSheet.flatten(content().parent!.parent!.props.style);
      act(() =>
        content().props.onLayout({ nativeEvent: { layout: { height: 200 } } })
      );
      const event = { height: 300, progress: 1, duration: 250, target: 1 };
      expect(card().marginBottom).toBe(mode === 'floating' ? 32 : 0);
      act(() => mockKeyboardHandlers.onEnd!(event));
      expect(card().marginBottom).toBe(mode === 'floating' ? 12 : 0);
      expect(sheet(renderer).props.style.bottom).toBe(300);
      expect(card().height).toBe(
        mode === 'fullScreen' ? 500 : mode === 'sheet' ? 180 : 200
      );
      if (mode === 'fullScreen')
        expect(
          StyleSheet.flatten(pageFor(renderer, Form).props.style).height
        ).toBe(380);
      act(() =>
        mockKeyboardHandlers.onEnd!({ ...event, height: 0, progress: 0 })
      );
      expect(card().marginBottom).toBe(mode === 'floating' ? 32 : 0);
      expect(card().height).toBe(mode === 'fullScreen' ? 800 : 200);
      expect(sheet(renderer).props.style.bottom).toBe(0);
      expect(renderer.root.findByProps({ testID: 'draft' }).props.value).toBe(
        'draft'
      );
    } finally {
      if (renderer) act(() => renderer.unmount());
      Dimensions.set(dimensions);
    }
  }
);

test.each([
  { appearance: 'floating', topInset: 0 },
  { appearance: 'floating', topInset: 50 },
  { appearance: 'sheet', topInset: 0 },
  { appearance: 'sheet', topInset: 50 },
] as const)(
  'restores $appearance geometry and form state with topInset=$topInset on Back',
  ({ appearance, topInset }) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Tray.Provider>
          <Observer />
          <Tray.Stack
            appearance={appearance}
            topInset={topInset}
            bottomInset={20}
          >
            <Tray.Screen name="form" component={Form} />
            <Tray.Screen
              name="preview"
              component={Preview}
              options={{ presentation: 'fullScreen' }}
            />
          </Tray.Stack>
        </Tray.Provider>
      );
    });
    const content = () =>
      sheet(renderer)
        .findAllByType(View)
        .find((view) => typeof view.props.onLayout === 'function')!;
    const layout = (height: number) =>
      act(() =>
        content().props.onLayout({ nativeEvent: { layout: { height } } })
      );
    const viewport = () => StyleSheet.flatten(content().parent!.props.style);
    const card = () =>
      StyleSheet.flatten(content().parent!.parent!.props.style);
    const window = Dimensions.get('window');
    act(() => navigation.present('form'));
    layout(200);
    act(() => sheet(renderer).props.onSettle(1));
    act(() => renderer.root.findByType(TextInput).props.onChangeText('edited'));
    act(() => navigation.push('preview', { label: 'full screen' }));
    layout(200);
    expect(viewport().width).toBe(window.width);
    expect(viewport().height).toBe(window.height - topInset);
    expect(content().props.style).toEqual({
      paddingBottom: 20,
    });
    const page = pageFor(renderer, Preview);
    expect(StyleSheet.flatten(page.props.style)).toMatchObject({
      height: window.height - topInset - 90,
    });
    expect(renderer.root.findAllByType(Form)).toHaveLength(1);
    act(() => mockCompletions.shift()!(true));
    expect(viewport().transform).toEqual([{ translateY: topInset }]);
    expect(viewport().height + viewport().transform[0].translateY).toBe(
      window.height
    );
    expect(card()).toMatchObject({
      height: window.height,
      marginHorizontal: 0,
      marginBottom: 0,
      borderRadius: 0,
    });

    act(() => navigation.back());
    layout(200);
    expect(renderer.root.findAllByType(Preview)).toHaveLength(1);
    act(() => mockCompletions.shift()!(true));
    expect(viewport().transform).toEqual([{ translateY: 0 }]);
    expect(renderer.root.findAllByType(Preview)).toHaveLength(0);
    expect(renderer.root.findByType(TextInput).props.value).toBe('edited');
    expect(card()).toMatchObject({
      height: 200,
      marginHorizontal: appearance === 'floating' ? 16 : 0,
      marginBottom: appearance === 'floating' ? 32 : 0,
      borderRadius: 30,
    });
    act(() => renderer.unmount());
  }
);

test('uses the new transition start visibility for pushed and retained Back pages', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        {stack()}
      </Tray.Provider>
    );
  });
  const opacity = (component: React.ElementType) => {
    const page = pageFor(renderer, component);
    let node = renderer.root.findByType(component).parent;
    let value = 1;
    while (node && node !== page.parent) {
      value *= StyleSheet.flatten(node.props.style)?.opacity ?? 1;
      node = node.parent;
    }
    return value;
  };
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  expect(opacity(Form)).toBe(1);

  act(() => navigation.push('preview', { label: 'next' }));
  expect(opacity(Preview)).toBe(0);
  expect(opacity(Form)).toBe(1);
  const forwardComplete = mockCompletions.shift()!;
  act(() => forwardComplete(true));
  expect(opacity(Preview)).toBe(1);
  expect(opacity(Form)).toBe(0);

  act(() => navigation.back());
  expect(opacity(Form)).toBe(0);
  expect(opacity(Preview)).toBe(1);
  act(() => forwardComplete(true));
  expect(opacity(Form)).toBe(0);
  act(() => mockCompletions.shift()!(true));
  expect(opacity(Form)).toBe(1);
  expect(renderer.root.findAllByType(Preview)).toHaveLength(0);
  act(() => renderer.unmount());
});

test('gates a shared destination before its layout is ready without releasing the source', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        {stack()}
      </Tray.Provider>
    );
  });
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  await act(async () => {
    navigation.push('preview', { label: 'shared' }, { groupId: 'avatar' });
  });
  const target = pageFor(renderer, Preview);
  expect(StyleSheet.flatten(target.props.style).opacity).toBe(0);
  expect(target.props.pointerEvents).toBe('none');
  expect(target.props.accessibilityElementsHidden).toBe(true);
  expect(renderer.root.findAllByType(Form)).toHaveLength(1);
  expect(mockCompletions).toHaveLength(0);
  act(() => renderer.unmount());
});

test('presents a full-screen root and shrinks for a pushed content-sized page', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Tray.Stack topInset={50} bottomInset={20}>
          <Tray.Screen name="form" component={Form} />
          <Tray.Screen
            name="preview"
            component={Preview}
            options={{ presentation: 'fullScreen' }}
          />
        </Tray.Stack>
      </Tray.Provider>
    );
  });
  const content = () =>
    sheet(renderer)
      .findAllByType(View)
      .find((view) => typeof view.props.onLayout === 'function')!;
  act(() => navigation.present('preview', { label: 'root' }));
  act(() =>
    content().props.onLayout({ nativeEvent: { layout: { height: 200 } } })
  );
  expect(
    StyleSheet.flatten(content().parent!.parent!.props.style)
  ).toMatchObject({
    height: Dimensions.get('window').height,
    marginHorizontal: 0,
    marginBottom: 0,
  });
  act(() => sheet(renderer).props.onSettle(1));
  act(() => navigation.push('form'));
  expect(
    StyleSheet.flatten(pageFor(renderer, Preview).props.style)
  ).toMatchObject({
    height: Dimensions.get('window').height - 140,
    width: Dimensions.get('window').width,
  });
  act(() =>
    content().props.onLayout({ nativeEvent: { layout: { height: 200 } } })
  );
  act(() => mockCompletions.shift()!(true));
  expect(
    StyleSheet.flatten(content().parent!.parent!.props.style)
  ).toMatchObject({ height: 200, marginHorizontal: 16, marginBottom: 32 });
  act(() => navigation.back());
  act(() =>
    content().props.onLayout({ nativeEvent: { layout: { height: 200 } } })
  );
  act(() => mockCompletions.shift()!(true));
  expect(StyleSheet.flatten(content().parent!.parent!.props.style).height).toBe(
    Dimensions.get('window').height
  );
  expect(renderer.root.findAllByType(Preview)).toHaveLength(1);
  act(() => renderer.unmount());
});

test('preserves drafts across rerenders and Back, releasing popped views only on completion', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  const render = () => (
    <Tray.Provider>
      <Observer />
      {stack()}
    </Tray.Provider>
  );
  act(() => {
    renderer = TestRenderer.create(render());
  });
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  act(() => renderer.root.findByType(TextInput).props.onChangeText('edited'));
  act(() => navigation.push('preview', { label: 'hello' }));
  expect(renderer.root.findAllByType(Form)).toHaveLength(1);
  expect(renderer.root.findAllByType(Preview)).toHaveLength(1);
  expect(unmounted).toEqual([]);
  act(() => renderer.update(render()));
  expect(mockCompletions).toHaveLength(1);
  act(() => mockCompletions.shift()!(true));
  act(() => navigation.back());
  const complete = mockCompletions.shift()!;
  act(() => complete(false));
  expect(renderer.root.findAllByType(Preview)).toHaveLength(1);
  act(() => complete(true));
  expect(renderer.root.findAllByType(Preview)).toHaveLength(0);
  expect(renderer.root.findByType(TextInput).props.value).toBe('edited');
  expect(unmounted).not.toContain('form');
  act(() => renderer.unmount());
});

test('dismissal keeps content until native ack and an old ack cannot dismiss the reopened sheet', () => {
  const onDismiss = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        {stack(Tray, onDismiss)}
      </Tray.Provider>
    );
  });
  act(() => navigation.present('form'));
  const oldSettled = sheet(renderer).props.onSettle;
  act(() => oldSettled(1));
  act(() => navigation.dismiss());
  expect(renderer.root.findAllByType(Form)).toHaveLength(1);
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => navigation.present('preview', { label: 'new' }));
  act(() => oldSettled(0));
  expect(unmounted).toEqual(['form']);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(navigationState.route?.name).toBe('preview');
  act(() => oldSettled(0));
  expect(navigationState.isPresented).toBe(true);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('rejects missing screens before opening a native sheet', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        {stack()}
      </Tray.Provider>
    );
  });
  expect(() => {
    // @ts-expect-error Also exercise the runtime guard for untyped callers.
    navigation.present('missing');
  }).toThrow('Unknown tray screen: missing');
  expect(navigationState.isPresented).toBe(false);
  act(() => renderer.unmount());
});

test.each(['separate factories', 'the same factory'])(
  'isolates nested provider stacks using %s',
  (definition) => {
    const InnerTray =
      definition === 'the same factory' ? Tray : createTray<Routes>();
    let outer!: TrayNavigation<Routes>;
    let inner!: TrayNavigation<Routes>;
    let outerState!: TrayState<Routes>;
    let innerState!: TrayState<Routes>;
    const outerDismissed = jest.fn();
    const innerDismissed = jest.fn();
    function OuterObserver() {
      outer = Tray.useTray();
      outerState = Tray.useTrayState((state) => state);
      return null;
    }
    function InnerObserver() {
      inner = InnerTray.useTray();
      innerState = InnerTray.useTrayState((state) => state);
      return null;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Tray.Provider>
          <OuterObserver />
          {stack(Tray, outerDismissed)}
          <InnerTray.Provider>
            <InnerObserver />
            {stack(InnerTray, innerDismissed)}
          </InnerTray.Provider>
        </Tray.Provider>
      );
    });

    act(() => outer.present('form'));
    const outerSettled = sheet(renderer).props.onSettle;
    act(() => outerSettled(1));
    act(() => outer.push('preview', { label: 'outer' }));
    act(() => mockCompletions.shift()!(true));
    expect(outerState.depth).toBe(2);
    expect(innerState.depth).toBe(0);
    expect(innerState.isPresented).toBe(false);
    act(() => outer.dismiss());
    act(() => outerSettled(0));
    expect(outerDismissed).toHaveBeenCalledTimes(1);
    expect(innerDismissed).not.toHaveBeenCalled();

    act(() => inner.present('form'));
    act(() => sheet(renderer).props.onSettle(1));
    act(() => inner.push('preview', { label: 'inner' }));
    act(() => mockCompletions.shift()!(true));
    act(() => outer.back());
    act(() => outerSettled(0));
    expect(outerState.depth).toBe(0);
    expect(outerState.isPresented).toBe(false);
    expect(innerState.depth).toBe(2);
    expect(innerState.route?.params).toEqual({ label: 'inner' });
    act(() => inner.back());
    act(() => mockCompletions.shift()!(true));
    expect(innerState.depth).toBe(1);
    expect(innerState.route?.name).toBe('form');
    expect(innerDismissed).not.toHaveBeenCalled();
    expect(outerDismissed).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  }
);

function ConfigurableTray({
  title = 'Form',
  showPreview = true,
  form = Form,
}: {
  title?: string;
  showPreview?: boolean;
  form?: typeof Form;
}) {
  return (
    <Tray.Provider>
      <Observer />
      <>
        <View testID="app-content" />
        <Tray.Stack backgroundColor="#123456">
          <Tray.Screen name="form" component={form} options={{ title }} />
          <>
            {showPreview && <Tray.Screen name="preview" component={Preview} />}
          </>
        </Tray.Stack>
      </>
    </Tray.Provider>
  );
}

test('reads fragments without mounting declarations and updates titles without remounting views', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ConfigurableTray />);
  });
  expect(renderer.root.findAllByType(Form)).toHaveLength(0);
  expect(renderer.root.findAllByType(Preview)).toHaveLength(0);
  expect(renderer.root.findAllByType(Tray.Screen)).toHaveLength(0);
  const appContent = renderer.root.findByProps({ testID: 'app-content' });
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  act(() => renderer.root.findByType(TextInput).props.onChangeText('saved'));
  const present = navigation.present;
  act(() => renderer.update(<ConfigurableTray title="Updated title" />));
  expect(navigation.present).toBe(present);
  expect(renderer.root.findByType(TextInput).props.value).toBe('saved');
  expect(renderer.root.findByProps({ testID: 'app-content' })).toBe(appContent);
  expect(
    renderer.root.findAllByType(Text).map((node) => node.props.children)
  ).toContain('Updated title');
  expect(unmounted).toEqual([]);
  act(() => navigation.push('preview', { label: 'preview' }));
  act(() => mockCompletions.shift()!(true));
  expect(
    renderer.root.findAllByType(Text).map((node) => node.props.children)
  ).toContain('preview');
  act(() => renderer.unmount());
});

test('validates missing declarations and accepts new declarations after a committed update', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ConfigurableTray showPreview={false} />);
  });
  expect(() => navigation.present('preview', { label: 'missing' })).toThrow(
    'Unknown tray screen: preview'
  );
  expect(navigationState.isPresented).toBe(false);
  act(() => renderer.update(<ConfigurableTray />));
  act(() => navigation.present('preview', { label: 'available' }));
  expect(renderer.root.findAllByType(Preview)).toHaveLength(1);
  act(() => renderer.unmount());
});

test('can present from a descendant mount effect before the Stack declaration in child order', () => {
  function OpenOnMount() {
    const { present } = Tray.useTray();
    useEffect(() => present('form'), [present]);
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <OpenOnMount />
        {stack()}
      </Tray.Provider>
    );
  });
  expect(renderer.root.findAllByType(Form)).toHaveLength(1);
  act(() => renderer.unmount());
});

test.each(['active', 'retained', 'queued'])(
  'rejects removing a declaration that is %s',
  (phase) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<ConfigurableTray />);
    });
    act(() => navigation.present('form'));
    if (phase !== 'queued') act(() => sheet(renderer).props.onSettle(1));
    act(() => navigation.push('preview', { label: phase }));
    if (phase === 'retained') {
      act(() => mockCompletions.shift()!(true));
      act(() => navigation.back());
    }
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => {
        act(() => renderer.update(<ConfigurableTray showPreview={false} />));
      }).toThrow('Cannot remove tray screen "preview" while it is in use');
    } finally {
      error.mockRestore();
      act(() => renderer.unmount());
    }
  }
);

test('rejects replacing the component of a live screen', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<ConfigurableTray />);
  });
  act(() => navigation.present('form'));
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(() => {
      act(() => renderer.update(<ConfigurableTray form={() => <View />} />));
    }).toThrow('Cannot change the component for tray screen "form"');
  } finally {
    error.mockRestore();
    act(() => renderer.unmount());
  }
});

function pageFor(
  renderer: TestRenderer.ReactTestRenderer,
  component: React.ElementType
) {
  let node = renderer.root.findByType(component).parent!;
  while (node.props.accessibilityElementsHidden === undefined)
    node = node.parent!;
  return node;
}

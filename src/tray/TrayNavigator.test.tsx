import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  act,
  fireEvent,
  render as renderComponent,
  type RenderResult,
} from '@testing-library/react-native/pure';
import * as Reanimated from 'react-native-reanimated';
import {
  BaseNavigationContainer,
  createNavigationContainerRef,
  createNavigatorFactory,
  StackActions,
  getStateFromPath,
  useIsFocused,
  usePreventRemove,
  StackRouter,
  useNavigationBuilder,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import {
  useTrayKeyboard as usePageKeyboard,
  useTrayDismiss,
} from './trayContexts';
import { createTrayNavigator, useTraySettled } from '../adapters/tray';
import { useTrayKeyboard } from './useTrayKeyboard';
import { trayStackLayout } from './trayStackLayout';
import { TrayHeaderLayer } from './TrayHeaderLayer';
import type { KeyboardHandler } from 'react-native-keyboard-controller';
import type {
  TrayHeaderProps,
  TrayLifecycleDetails,
  TrayScreenProps,
  TrayNavigatorProps,
} from './types';

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
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (fn: () => void) => fn(),
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    fn(...args),
}));
// Expo's navigation entry also exports native header widgets; this fixture renders tray headers.
jest.mock('expo-constants', () => ({ expoConfig: {} }), { virtual: true });
jest.mock('expo-router/build/react-navigation/elements', () => ({}));
jest.mock('@swmansion/react-native-bottom-sheet', () => ({
  BottomSheetProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  ModalBottomSheet: 'BottomSheet',
}));

type Routes = { form: undefined; preview: { label: string } };
const Tray = createTrayNavigator<Routes>();
type ParentRoutes = {
  home: undefined;
  tray: NavigatorScreenParams<Routes>;
  outside: undefined;
};
const ref = createNavigationContainerRef<ParentRoutes>();
function ParentStack({ children }: { children: React.ReactNode }) {
  const { NavigationContent } = useNavigationBuilder(StackRouter, {
    children,
    layout: trayStackLayout,
  });
  return <NavigationContent>{null}</NavigationContent>;
}
const Parent = createNavigatorFactory(ParentStack)();
const Empty = () => null;
function Home() {
  return <Pressable accessibilityLabel="Open tray" onPress={openForm} />;
}
function Fixture({
  children,
  initialState,
}: {
  children: React.ReactNode;
  initialState?: React.ComponentProps<
    typeof BaseNavigationContainer
  >['initialState'];
}) {
  return (
    <BaseNavigationContainer ref={ref} initialState={initialState}>
      <Parent.Navigator>
        <Parent.Screen name="home" component={Home} />
        <Parent.Screen name="tray">{() => children}</Parent.Screen>
        <Parent.Screen name="outside" component={Empty} />
      </Parent.Navigator>
    </BaseNavigationContainer>
  );
}
function openForm() {
  ref.navigate('tray', { screen: 'form' });
}
function openPreview(label: string) {
  ref.navigate('tray', { screen: 'preview', params: { label } });
}
function dismissTray() {
  ref.dispatch({ ...StackActions.pop(), target: ref.getRootState().key });
}
const currentRoute = () => ref.getCurrentRoute();
const unmounted: string[] = [];
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
    <Definition.Navigator onDismiss={onDismiss}>
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
    </Definition.Navigator>
  );
}
function sheet(renderer: RenderResult) {
  return renderer.UNSAFE_root.findByType('BottomSheet' as React.ElementType);
}

function lifecycleFixture() {
  const events: string[] = [];
  const callbacks = {
    onWillPresent: jest.fn((_details: TrayLifecycleDetails) =>
      events.push('willPresent')
    ),
    onPresent: jest.fn((_details: TrayLifecycleDetails) =>
      events.push('present')
    ),
    onNavigate: jest.fn((_details: TrayLifecycleDetails) => {}),
    onWillDismiss: jest.fn((_details: TrayLifecycleDetails) =>
      events.push('willDismiss')
    ),
    onDismiss: jest.fn(() => events.push('dismiss')),
  };
  const render = (options: Partial<TrayNavigatorProps> = callbacks) => (
    <Fixture>{React.cloneElement(stack(), options)}</Fixture>
  );
  let renderer!: RenderResult;

  renderer = renderComponent(render());

  return { renderer, render, events, callbacks };
}

test('dismissDisabled updates user controls without resetting content or blocking code dismissal', () => {
  const f = lifecycleFixture();
  const update = (dismissDisabled: boolean) =>
    f.renderer.rerender(f.render({ ...f.callbacks, dismissDisabled }));
  act(() => openForm());
  act(() => sheet(f.renderer).props.onSettle(1));
  fireEvent.changeText(f.renderer.getByTestId('draft'), 'keep my work');
  expect(sheet(f.renderer).props.detents).toEqual([0, 'content']);

  update(true);
  expect(sheet(f.renderer).props.detents).toEqual([
    { value: 0, programmatic: true },
    'content',
  ]);
  for (const label of ['Close tray', 'Dismiss tray']) {
    const button = f.renderer.getByLabelText(label);
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(button);
  }
  const escape = () =>
    f.renderer.UNSAFE_root.findAllByType(View)
      .find((node) => node.props.onAccessibilityEscape)!
      .props.onAccessibilityEscape();
  act(escape);
  expect(sheet(f.renderer).props.index).toBe(1);
  expect(f.callbacks.onWillDismiss).not.toHaveBeenCalled();
  expect(f.renderer.getByTestId('draft').props.value).toBe('keep my work');

  update(false);
  expect(sheet(f.renderer).props.detents).toEqual([0, 'content']);
  fireEvent.press(f.renderer.getByLabelText('Close tray'));
  expect(sheet(f.renderer).props.index).toBe(0);
  update(true);
  expect(sheet(f.renderer).props.index).toBe(0);
  act(() => sheet(f.renderer).props.onSettle(0));
  expect(f.callbacks.onDismiss).toHaveBeenCalledTimes(1);

  act(() => openForm());
  act(() => sheet(f.renderer).props.onSettle(1));
  act(() => dismissTray());
  expect(sheet(f.renderer).props.index).toBe(0);
  act(() => sheet(f.renderer).props.onSettle(0));
  expect(f.callbacks.onDismiss).toHaveBeenCalledTimes(2);
  f.renderer.unmount();
});

test('dismissDisabled ignores a native close that finishes after dismissal is disabled', () => {
  const f = lifecycleFixture();
  const dismissKeyboard = jest.spyOn(Keyboard, 'dismiss');
  try {
    act(() => openForm());
    act(() => sheet(f.renderer).props.onSettle(1));
    fireEvent.changeText(
      f.renderer.getByTestId('draft'),
      'payment in progress'
    );
    f.renderer.rerender(f.render({ ...f.callbacks, dismissDisabled: true }));
    dismissKeyboard.mockClear();
    act(() => {
      sheet(f.renderer).props.onIndexChange(0);
      sheet(f.renderer).props.onSettle(0);
    });
    expect(sheet(f.renderer).props.index).toBe(1);
    expect(f.callbacks.onWillDismiss).not.toHaveBeenCalled();
    expect(f.callbacks.onDismiss).not.toHaveBeenCalled();
    expect(dismissKeyboard).not.toHaveBeenCalled();
    expect(f.renderer.getByTestId('draft').props.value).toBe(
      'payment in progress'
    );
    expect(unmounted).toEqual([]);
  } finally {
    f.renderer.unmount();
    dismissKeyboard.mockRestore();
  }
});

test('dismissDisabled accepts native close callbacks after programmatic dismissal', () => {
  const f = lifecycleFixture();
  f.renderer.rerender(f.render({ ...f.callbacks, dismissDisabled: true }));
  act(() => openForm());
  act(() => sheet(f.renderer).props.onSettle(1));
  act(() => dismissTray());
  act(() => sheet(f.renderer).props.onIndexChange(0));
  expect(sheet(f.renderer).props.index).toBe(0);
  act(() => sheet(f.renderer).props.onSettle(0));
  expect(currentRoute()?.name !== 'home').toBe(false);
  expect(f.callbacks.onWillDismiss).toHaveBeenCalledTimes(1);
  expect(f.callbacks.onDismiss).toHaveBeenCalledTimes(1);
  f.renderer.unmount();
});

test('an enabled user snap to closed still dismisses the tray', () => {
  const f = lifecycleFixture();
  f.renderer.rerender(f.render({ ...f.callbacks, dismissDisabled: false }));
  act(() => openForm());
  act(() => sheet(f.renderer).props.onSettle(1));
  act(() => sheet(f.renderer).props.onIndexChange(0));
  expect(sheet(f.renderer).props.index).toBe(0);
  act(() => sheet(f.renderer).props.onSettle(0));
  expect(currentRoute()?.name !== 'home').toBe(false);
  expect(f.callbacks.onWillDismiss).toHaveBeenCalledTimes(1);
  expect(f.callbacks.onDismiss).toHaveBeenCalledTimes(1);
  f.renderer.unmount();
});

test('dismissDisabled consumes hardware Back at the root and still allows keyboard and stack Back', () => {
  let back!: () => boolean | null | undefined;
  const listener = jest
    .spyOn(BackHandler, 'addEventListener')
    .mockImplementation((_event, handler) => {
      back = () => handler({ type: 'hardwareBackPress', timeStamp: 0 });
      return { remove: jest.fn() };
    });
  const keyboardVisible = jest
    .spyOn(Keyboard, 'isVisible')
    .mockReturnValue(false);
  const dismissKeyboard = jest
    .spyOn(Keyboard, 'dismiss')
    .mockImplementation(() => {});
  const f = lifecycleFixture();
  try {
    f.renderer.rerender(f.render({ ...f.callbacks, dismissDisabled: true }));
    act(() => openForm());
    act(() => sheet(f.renderer).props.onSettle(1));
    act(() => expect(back()).toBe(true));
    expect(sheet(f.renderer).props.index).toBe(1);
    keyboardVisible.mockReturnValue(true);
    dismissKeyboard.mockClear();
    act(() => back());
    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    keyboardVisible.mockReturnValue(false);

    act(() => ref.dispatch(StackActions.push('preview', { label: 'next' })));
    act(() => mockCompletions.shift()!(true));
    act(() => back());
    expect(currentRoute()?.name).toBe('form');
    act(() => mockCompletions.shift()!(true));
    act(() => back());
    expect(f.callbacks.onWillDismiss).not.toHaveBeenCalled();

    f.renderer.rerender(f.render({ ...f.callbacks, dismissDisabled: false }));
    act(() => back());
    expect(sheet(f.renderer).props.index).toBe(0);
  } finally {
    f.renderer.unmount();
    listener.mockRestore();
    keyboardVisible.mockRestore();
    dismissKeyboard.mockRestore();
  }
});

test('a reduced-motion tray accepts pushes without a native opening settlement', () => {
  const motion = jest
    .spyOn(Reanimated, 'useReducedMotion')
    .mockReturnValue(true);
  const f = lifecycleFixture();
  try {
    act(() => openForm());
    expect(sheet(f.renderer).props.animateIn).toBe(false);
    expect(f.events).toEqual(['willPresent', 'present']);
    act(() => ref.dispatch(StackActions.push('preview', { label: 'next' })));
    expect(currentRoute()?.name).toBe('preview');
  } finally {
    f.renderer.unmount();
    motion.mockRestore();
  }
});

test('a cancelled closing gesture does not dismiss or present again', () => {
  const f = lifecycleFixture();
  act(() => openForm());
  act(() => sheet(f.renderer).props.onSettle(1));
  // A drag released back to open is not a dismissal attempt.
  act(() => sheet(f.renderer).props.onIndexChange(1));
  act(() => sheet(f.renderer).props.onSettle(1));
  expect(f.events).toEqual(['willPresent', 'present']);
  act(() => sheet(f.renderer).props.onIndexChange(0));
  const latePosition = sheet(f.renderer).props.onPositionChange;
  act(() => sheet(f.renderer).props.onIndexChange(1));
  act(() => latePosition({ nativeEvent: { position: 0, index: 0 } }));
  act(() => sheet(f.renderer).props.onSettle(0));
  act(() => sheet(f.renderer).props.onSettle(1));
  expect(f.events).toEqual(['willPresent', 'present', 'willDismiss']);
  expect(currentRoute()?.name !== 'home').toBe(true);
  act(() => sheet(f.renderer).props.onIndexChange(0));
  act(() => sheet(f.renderer).props.onSettle(0));
  expect(f.events).toEqual([
    'willPresent',
    'present',
    'willDismiss',
    'willDismiss',
    'dismiss',
  ]);
  act(() => f.renderer.unmount());
});

beforeEach(() => {
  mockCompletions.length = 0;
  unmounted.length = 0;
});

test('built-in header preserves Back and Close actions and accessibility', () => {
  const onDismiss = jest.fn();
  let renderer!: RenderResult;

  renderer = renderComponent(
    <Fixture>
      <Tray.Navigator textColor="#123456" onDismiss={onDismiss}>
        <Tray.Screen name="form" component={Form} />
        <Tray.Screen name="preview" component={Preview} />
      </Tray.Navigator>
    </Fixture>
  );

  const button = (label: string) =>
    renderer.UNSAFE_root.findAll(
      (n) =>
        n.props.accessibilityLabel === label &&
        typeof n.props.onPress === 'function'
    )[0]!;
  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  expect(
    StyleSheet.flatten(button('Close tray').findByType(Text).props.style).color
  ).toBe('#123456');
  expect(button('Back in tray').props.disabled).toBe(true);
  expect(button('Back in tray').props.accessibilityElementsHidden).toBe(true);
  act(() => ref.dispatch(StackActions.push('preview', { label: 'next' })));
  act(() => mockCompletions.shift()!(true));
  expect(button('Back in tray').props.disabled).toBe(false);
  act(() => button('Back in tray').props.onPress());
  expect(currentRoute()?.name).toBe('form');
  act(() => mockCompletions.shift()!(true));
  act(() => button('Close tray').props.onPress());
  expect(sheet(renderer).props.index).toBe(0);
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => sheet(renderer).props.onSettle(0));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

function CustomHeader({
  title,
  canGoBack,
  dismissDisabled,
  navigation,
  dismiss,
  color,
}: TrayHeaderProps) {
  return (
    <View>
      <Text accessibilityRole="header" style={{ color }}>
        {title}
      </Text>
      {canGoBack && (
        <Pressable testID="header-back" onPress={navigation.goBack} />
      )}
      <Pressable
        testID="header-close"
        disabled={dismissDisabled}
        onPress={dismiss}
      />
    </View>
  );
}

test('custom headers inherit stack defaults, override per screen, and own their navigation buttons', () => {
  const renderHeader = jest.fn((props: TrayHeaderProps) => (
    <CustomHeader {...props} />
  ));
  const onDismiss = jest.fn();
  const render = (title = 'Draft', dismissDisabled = false) => (
    <Fixture>
      <Tray.Navigator
        renderHeader={renderHeader}
        dismissDisabled={dismissDisabled}
        textColor="#123456"
        onDismiss={onDismiss}
      >
        <Tray.Screen name="form" component={Form} options={{ title }} />
        <Tray.Screen
          name="preview"
          component={Preview}
          options={{
            renderHeader: (props) => (
              <CustomHeader
                {...props}
                title={(props.route.params as Routes['preview']).label}
              />
            ),
          }}
        />
      </Tray.Navigator>
    </Fixture>
  );
  let renderer!: RenderResult;

  renderer = renderComponent(render());

  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  expect(renderHeader).toHaveBeenLastCalledWith({
    route: currentRoute(),
    navigation: expect.any(Object),
    dismiss: expect.any(Function),
    title: 'Draft',
    canGoBack: false,
    dismissDisabled: false,
    color: '#123456',
  });
  expect(
    renderer.UNSAFE_root.findAllByProps({ testID: 'header-back' })
  ).toHaveLength(0);
  act(() =>
    renderer.UNSAFE_root.findByType(TextInput).props.onChangeText('edited')
  );
  act(() => renderer.rerender(render('Updated')));
  expect(renderer.UNSAFE_root.findByType(CustomHeader).props.title).toBe(
    'Updated'
  );
  act(() => renderer.rerender(render('Updated', true)));
  fireEvent.press(renderer.getByTestId('header-close'));
  expect(sheet(renderer).props.index).toBe(1);
  expect(
    renderer.UNSAFE_root.findByType(CustomHeader).props.dismissDisabled
  ).toBe(true);
  act(() => renderer.rerender(render('Updated')));
  expect(
    renderer.UNSAFE_root.findByType(CustomHeader).props.dismissDisabled
  ).toBe(false);
  act(() =>
    ref.dispatch(StackActions.push('preview', { label: 'Review draft' }))
  );
  expect(
    renderer.UNSAFE_root.findAllByType(CustomHeader).map(
      (header) => header.props.title
    )
  ).toEqual(['Updated', 'Review draft']);
  act(() => mockCompletions.shift()!(true));
  expect(renderer.UNSAFE_root.findAllByType(CustomHeader)).toHaveLength(1);
  act(() =>
    renderer.UNSAFE_root.findByProps({ testID: 'header-back' }).props.onPress()
  );
  act(() => mockCompletions.shift()!(true));
  expect(renderer.UNSAFE_root.findByType(TextInput).props.value).toBe('edited');
  act(() =>
    renderer.UNSAFE_root.findByProps({ testID: 'header-close' }).props.onPress()
  );
  expect(sheet(renderer).props.index).toBe(0);
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => sheet(renderer).props.onSettle(0));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('crossfades custom and built-in headers without changing the outgoing title or Back button', () => {
  let renderer!: RenderResult;

  renderer = renderComponent(
    <Fixture>
      <Tray.Navigator>
        <Tray.Screen
          name="form"
          component={Form}
          options={{ title: 'Draft' }}
        />
        <Tray.Screen
          name="preview"
          component={Preview}
          options={{
            title: 'Review',
            renderHeader: (props) => <CustomHeader {...props} />,
          }}
        />
      </Tray.Navigator>
    </Fixture>
  );

  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  const builtIn = renderer.UNSAFE_root.findByType(TrayHeaderLayer);
  act(() => ref.dispatch(StackActions.push('preview', { label: 'Next' })));
  expect(renderer.UNSAFE_root.findAllByType(TrayHeaderLayer)).toHaveLength(2);
  expect(builtIn.props.active).toBe(false);
  expect(
    builtIn.findByProps({ accessibilityRole: 'header' }).props.children
  ).toBe('Draft');
  expect(
    builtIn.findByProps({ accessibilityLabel: 'Back in tray' }).props.disabled
  ).toBe(true);
  expect(renderer.UNSAFE_root.findByType(CustomHeader).props.title).toBe(
    'Review'
  );
  act(() => mockCompletions.shift()!(true));
  act(() => ref.goBack());
  expect(renderer.UNSAFE_root.findAllByType(TrayHeaderLayer)).toHaveLength(2);
  expect(renderer.UNSAFE_root.findByType(CustomHeader).props.title).toBe(
    'Review'
  );
  act(() => mockCompletions.shift()!(true));
  expect(renderer.UNSAFE_root.findAllByType(CustomHeader)).toHaveLength(0);
  expect(renderer.UNSAFE_root.findAllByType(TrayHeaderLayer)).toHaveLength(1);
  act(() => renderer.unmount());
});

test('retains one outgoing header instance until settlement, including queued Back and dismissal', () => {
  const mounted: string[] = [];
  const released: string[] = [];
  function StatefulHeader(props: TrayHeaderProps) {
    const [value, setValue] = useState('header draft');
    useEffect(() => {
      mounted.push(props.route.key);
      return () => {
        released.push(props.route.key);
      };
    }, [props.route.key]);
    return (
      <TextInput
        testID={props.route.key}
        value={value}
        onChangeText={setValue}
      />
    );
  }
  let renderer!: RenderResult;

  renderer = renderComponent(
    <Fixture>
      <Tray.Navigator renderHeader={(props) => <StatefulHeader {...props} />}>
        <Tray.Screen name="form" component={Form} />
        <Tray.Screen name="preview" component={Preview} />
      </Tray.Navigator>
    </Fixture>
  );

  const headers = () => renderer.UNSAFE_root.findAllByType(StatefulHeader);
  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  const rootKey = currentRoute()!.key;
  const first = headers()[0]!;
  const measure = (node: RenderResult['UNSAFE_root'], height: number) =>
    act(() => node.props.onLayout({ nativeEvent: { layout: { height } } }));
  measure(headerFor(first), 90);
  measure(pageFor(renderer, Form), 200);
  act(() => first.findByType(TextInput).props.onChangeText('edited header'));
  act(() => ref.dispatch(StackActions.push('preview', { label: 'Next' })));
  const nextKey = currentRoute()!.key;
  measure(headerFor(headers()[1]!), 90);
  measure(pageFor(renderer, Preview), 200);
  expect(headers()[0]).toBe(first);
  expect(first.findByType(TextInput).props.value).toBe('edited header');
  expect(mounted).toEqual([rootKey, nextKey]);
  const outgoing = renderer.UNSAFE_root.findAllByType(TrayHeaderLayer).find(
    (layer) => !layer.props.active
  )!;
  expect(outgoing.findByType(View).props.pointerEvents).toBe('none');
  expect(outgoing.findByType(View).props.accessibilityElementsHidden).toBe(
    true
  );
  expect(released).toEqual([]);
  act(() => ref.goBack());
  const staleCompletion = mockCompletions.shift()!;
  act(() => staleCompletion(true));
  expect(currentRoute()?.key).toBe(rootKey);
  // No new native onLayout is sent when this measured header becomes active again.
  // Queued Back reuses the still-mounted header without dropping its local state.
  expect(headers().find((header) => header.props.route.key === rootKey)).toBe(
    first
  );
  act(() => staleCompletion(true));
  expect(headers()).toHaveLength(2);
  act(() => mockCompletions.shift()!(true));
  expect(headers()).toHaveLength(1);
  expect(released).toEqual([nextKey]);
  act(() => ref.dispatch(StackActions.push('preview', { label: 'Closing' })));
  act(() => dismissTray());
  act(() => sheet(renderer).props.onSettle(0));
  expect(headers()).toHaveLength(0);
  expect(released).toContain(rootKey);
  act(() => mockCompletions.shift()!(true));
  expect(headers()).toHaveLength(0);
  act(() => renderer.unmount());
});

test('measures custom headers independently for retained pages and ignores stale layout callbacks', () => {
  let renderer!: RenderResult;

  renderer = renderComponent(
    <Fixture>
      <Tray.Navigator
        topInset={50}
        bottomInset={20}
        handleVisible={false}
        renderHeader={(props) => <CustomHeader {...props} />}
      >
        <Tray.Screen
          name="form"
          component={Form}
          options={{ presentation: 'fullScreen' }}
        />
        <Tray.Screen
          name="preview"
          component={Preview}
          options={{ presentation: 'fullScreen', handleVisible: true }}
        />
      </Tray.Navigator>
    </Fixture>
  );

  const layout = (callback: (event: unknown) => void, height: number) =>
    act(() => callback({ nativeEvent: { layout: { height } } }));
  const measureHeader = () =>
    headerFor(
      renderer.UNSAFE_root.findAllByType(CustomHeader).find(
        (header) => header.props.route.key === currentRoute()?.key
      )!
    ).props.onLayout;
  const pageHeight = (component: React.ElementType) =>
    viewportStyle(renderer, component).height;
  const windowHeight = Dimensions.get('window').height;
  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  const staleLayout = measureHeader();
  layout(staleLayout, 90);
  layout(pageFor(renderer, Form).props.onLayout, windowHeight - 160);
  expect(pageHeight(Form)).toBe(windowHeight - 160);
  layout(staleLayout, NaN);
  layout(staleLayout, -1);
  layout(staleLayout, Infinity);
  expect(pageHeight(Form)).toBe(windowHeight - 160);
  act(() => ref.dispatch(StackActions.push('preview', { label: 'Next' })));
  layout(measureHeader(), 120);
  expect(pageHeight(Preview)).toBe(windowHeight - 204);
  expect(pageHeight(Form)).toBe(windowHeight - 160);
  layout(staleLayout, 300);
  expect(pageHeight(Form)).toBe(windowHeight - 160);
  act(() => mockCompletions.shift()!(true));
  act(() => ref.goBack());
  layout(measureHeader(), 100);
  expect(pageHeight(Form)).toBe(windowHeight - 170);
  act(() => mockCompletions.shift()!(true));
  act(() =>
    mockKeyboardHandlers.onEnd!({
      height: 200,
      progress: 1,
      duration: 250,
      target: 1,
    })
  );
  expect(pageHeight(Form)).toBe(windowHeight - 350);
  act(() => renderer.unmount());
  layout(staleLayout, 500);
});

test('a null header and hidden handle leave no reserved header space', () => {
  let renderer!: RenderResult;
  const render = (
    handleVisible: boolean,
    custom = true,
    dismissDisabled = false
  ) => (
    <Fixture>
      <Tray.Navigator
        handleVisible={handleVisible}
        dismissDisabled={dismissDisabled}
        renderHeader={custom ? () => null : undefined}
      >
        <Tray.Screen
          name="form"
          component={Form}
          options={{ presentation: 'fullScreen' }}
        />
      </Tray.Navigator>
    </Fixture>
  );

  renderer = renderComponent(render(false));

  act(() => openForm());
  const header = renderer.UNSAFE_root.findByType(TrayHeaderLayer)
    .findAllByType(View)
    .find((view) => view.props.onLayout)!;
  act(() => header.props.onLayout({ nativeEvent: { layout: { height: 0 } } }));
  const pageHeight = () => viewportStyle(renderer, Form).height;
  const windowHeight = Dimensions.get('window').height;
  expect(pageHeight()).toBe(windowHeight);
  act(() => renderer.rerender(render(true)));
  expect(pageHeight()).toBe(windowHeight - 14);
  act(() => renderer.rerender(render(false, false)));
  expect(pageHeight()).toBe(windowHeight - 56);
  act(() => renderer.rerender(render(true, false)));
  expect(pageHeight()).toBe(windowHeight - 70);
  act(() => renderer.rerender(render(true, false, true)));
  expect(pageHeight()).toBe(windowHeight - 56);
  act(() => renderer.rerender(render(true, false)));
  expect(pageHeight()).toBe(windowHeight - 70);
  act(() => renderer.unmount());
});

test('a custom header height hint applies until its first layout', () => {
  let renderer!: RenderResult;

  renderer = renderComponent(
    <Fixture>
      <Tray.Navigator handleVisible={false} renderHeader={() => null}>
        <Tray.Screen
          name="form"
          component={Form}
          options={{ presentation: 'fullScreen', headerHeight: 0 }}
        />
      </Tray.Navigator>
    </Fixture>
  );

  act(() => openForm());
  const pageHeight = () => viewportStyle(renderer, Form).height;
  const windowHeight = Dimensions.get('window').height;
  expect(pageHeight()).toBe(windowHeight);
  const header = renderer.UNSAFE_root.findByType(TrayHeaderLayer)
    .findAllByType(View)
    .find((view) => view.props.onLayout)!;
  act(() => header.props.onLayout({ nativeEvent: { layout: { height: 40 } } }));
  expect(pageHeight()).toBe(windowHeight - 40);
  act(() => renderer.unmount());
});

test('keeps the outgoing title until settlement while exposing only the current heading', () => {
  let renderer!: RenderResult;

  renderer = renderComponent(<Fixture>{stack()}</Fixture>);

  const headings = () =>
    renderer.UNSAFE_root.findAllByType(Text)
      .filter((node) => node.props.accessibilityRole === 'header')
      .map((node) => node.props.children);
  const outgoing = () =>
    renderer.UNSAFE_root.findAllByType(Text)
      .filter((node) => node.props.accessibilityElementsHidden)
      .map((node) => node.props.children);
  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  act(() => ref.dispatch(StackActions.push('preview', { label: 'next' })));
  expect(headings()).toEqual(['Preview']);
  expect(outgoing()).toEqual(['Form']);
  const forwardComplete = mockCompletions.shift()!;
  act(() => forwardComplete(true));
  expect(outgoing()).toEqual([]);

  act(() => ref.goBack());
  expect(headings()).toEqual(['Form']);
  expect(outgoing()).toEqual(['Preview']);
  act(() => forwardComplete(true));
  expect(outgoing()).toEqual(['Preview']);
  act(() => mockCompletions.shift()!(true));
  expect(outgoing()).toEqual([]);

  act(() => ref.dispatch(StackActions.replace('preview', { label: 'root' })));
  expect(headings()).toEqual(['Preview']);
  expect(outgoing()).toEqual(['Form']);
  act(() => mockCompletions.shift()!(true));
  expect(outgoing()).toEqual([]);
  act(() => renderer.unmount());
});

test('ignores invalid page measurements and keeps a stable viewport while resizing', () => {
  let renderer!: RenderResult;

  renderer = renderComponent(<Fixture>{stack()}</Fixture>);

  act(() => openForm());
  layoutPage(renderer, Form, -1);
  layoutPage(renderer, Form, NaN);
  expect(cardStyle(renderer).height).toBe('auto');
  const viewportHeight = viewportStyle(renderer, Form).height;
  expect(viewportHeight).toBeGreaterThan(200);
  layoutPage(renderer, Form, 130);
  expectIntrinsicLayout(renderer, Form, 70);
  act(() => sheet(renderer).props.onSettle(1));
  act(() => ref.dispatch(StackActions.push('preview', { label: 'tall page' })));
  layoutPage(renderer, Preview, 430);
  layoutPage(renderer, Preview, 430.2);
  expect(viewportStyle(renderer, Preview).height).toBe(viewportHeight);
  act(() => mockCompletions.shift()!(true));
  expectIntrinsicLayout(renderer, Preview, 70);
  act(() => renderer.unmount());
});

test.each([
  ['floating', 'top'],
  ['floating', 'bottom'],
  ['sheet', 'top'],
  ['sheet', 'bottom'],
] as const)(
  'keeps the %s/%s card sized between React commits and UI layout updates',
  (appearance, anchor) => {
    // Native animated styles can still contain the previous frame when React
    // commits navigation. Flush them separately to expose a zero-height card
    // caused by switching the last in-flow child to absolute in React.
    type PendingStyle = {
      update: () => object;
      applied: Record<string, unknown>;
    };
    const pending = new Set<PendingStyle>();
    const animatedStyle = jest
      .spyOn(Reanimated, 'useAnimatedStyle')
      .mockImplementation((update) => {
        const styleRef = useRef<PendingStyle | undefined>(undefined);
        if (!styleRef.current) {
          styleRef.current = { update, applied: { ...update() } };
          pending.add(styleRef.current);
        }
        styleRef.current.update = update;
        return styleRef.current.applied as unknown as ReturnType<
          typeof Reanimated.useAnimatedStyle
        >;
      });
    const flushUI = () => {
      for (const style of pending) Object.assign(style.applied, style.update());
    };
    let renderer!: RenderResult;
    try {
      renderer = renderComponent(
        <Fixture>
          <Tray.Navigator appearance={appearance} anchor={anchor}>
            <Tray.Screen name="form" component={Form} />
            <Tray.Screen name="preview" component={Preview} />
          </Tray.Navigator>
        </Fixture>
      );

      act(() => openForm());
      layoutPage(renderer, Form, 200);
      act(() => sheet(renderer).props.onSettle(1));
      flushUI();
      expect(cardStyle(renderer).marginBottom).toBe(0);
      const input = renderer.UNSAFE_root.findByType(TextInput);
      act(() => input.props.onChangeText('retained through layout handoff'));
      const expectInFlow = (component: React.ElementType) => {
        expect(cardStyle(renderer).height).toBe('auto');
        expect(viewportStyle(renderer, component)).toMatchObject({
          position: 'relative',
          height: 'auto',
        });
        expect(
          StyleSheet.flatten(pageFor(renderer, component).props.style).position
        ).toBe('relative');
      };
      const expectFixed = () => {
        expect(cardStyle(renderer).height).toBeGreaterThanOrEqual(270);
        expect(viewportStyle(renderer, Form).position).toBe('absolute');
      };
      for (let visit = 0; visit < 2; visit++) {
        expectInFlow(Form);
        act(() =>
          ref.dispatch(StackActions.push('preview', { label: 'next' }))
        );
        // The source must still size an intrinsic card until the UI frame
        // switches both the card and its viewports into transition layout.
        expectInFlow(Form);
        layoutPage(renderer, Preview, 300);
        expectInFlow(Form);
        flushUI();
        expectFixed();
        expect(viewportStyle(renderer, Preview).position).toBe('absolute');
        act(() => mockCompletions.shift()!(true));
        expectFixed();
        flushUI();
        expectInFlow(Preview);

        act(() => ref.goBack());
        expectInFlow(Preview);
        flushUI();
        expectFixed();
        act(() => mockCompletions.shift()!(true));
        // Removing the outgoing page must also leave a sized card while the
        // returning page's UI style still contains its absolute positioning.
        expectFixed();
        expect(renderer.UNSAFE_root.findAllByType(Preview)).toHaveLength(0);
        flushUI();
        expectInFlow(Form);
        expect(renderer.UNSAFE_root.findByType(TextInput)).toBe(input);
        expect(input.props.value).toBe('retained through layout handoff');
      }
    } finally {
      if (renderer) act(() => renderer.unmount());
      animatedStyle.mockRestore();
    }
  }
);

test.each([
  [undefined, undefined],
  ['top', undefined],
  ['bottom', undefined],
  ['bottom', 'top'],
  ['top', 'bottom'],
] as const)(
  'keeps content at its %s anchor with a %s screen override through resize and Back',
  (anchor, previewAnchor) => {
    const stackAnchor = anchor ?? 'bottom';
    // Evaluate the actual style worklets as shared values change between React
    // commits; the ordinary mock only samples them during render.
    const animatedStyle = jest
      .spyOn(Reanimated, 'useAnimatedStyle')
      .mockImplementation((updater) =>
        Object.defineProperties(
          {} as ReturnType<typeof Reanimated.useAnimatedStyle>,
          Object.fromEntries(
            Object.keys(updater()).map((key) => [
              key,
              {
                enumerable: true,
                get: () => (updater() as Record<string, unknown>)[key],
              },
            ])
          )
        )
      );
    const useSharedValue = Reanimated.useSharedValue;
    const heights = new Set<Reanimated.SharedValue<number>>();
    const sharedValues = jest
      .spyOn(Reanimated, 'useSharedValue')
      .mockImplementation((initial) => {
        const value = useSharedValue(initial);
        if (initial === -1)
          heights.add(value as Reanimated.SharedValue<number>);
        return value;
      });
    let renderer!: RenderResult;
    try {
      renderer = renderComponent(
        <Fixture>
          <Tray.Navigator anchor={anchor}>
            <Tray.Screen name="form" component={Form} />
            <Tray.Screen
              name="preview"
              component={Preview}
              options={{ anchor: previewAnchor }}
            />
          </Tray.Navigator>
        </Fixture>
      );

      const layout = (node: RenderResult['UNSAFE_root'], height: number) =>
        act(() => node.props.onLayout({ nativeEvent: { layout: { height } } }));
      const card = () => cardStyle(renderer);
      const bottom = (component: React.ElementType, measuredHeight: number) => {
        const viewport = viewportStyle(renderer, component);
        const viewportTop =
          viewport.bottom === 0
            ? card().height - viewport.height
            : viewport.top;
        const pageTop =
          viewport.justifyContent === 'flex-end'
            ? viewport.height - measuredHeight
            : 0;
        return (
          viewportTop +
          viewport.transform[0].translateY +
          pageTop +
          measuredHeight
        );
      };
      act(() => openForm());
      expect(viewportStyle(renderer, Form)[stackAnchor]).toBe(0);
      const viewportHeight = viewportStyle(renderer, Form).height;
      layout(pageFor(renderer, Form), 200);
      const animatedHeight = [...heights][0]!;
      const input = renderer.UNSAFE_root.findByType(TextInput);
      act(() => input.props.onChangeText('retained draft'));
      act(() => sheet(renderer).props.onSettle(1));
      const checkFrames = (frames: number[]) => {
        for (const height of frames) {
          animatedHeight.value = height;
          expect(bottom(Form, 200)).toBeCloseTo(
            stackAnchor === 'bottom' ? card().height : 270
          );
          expect(bottom(Preview, 500)).toBeCloseTo(
            (previewAnchor ?? stackAnchor) === 'bottom' ? card().height : 570
          );
          expect(viewportStyle(renderer, Form).height).toBe(viewportHeight);
          expect(viewportStyle(renderer, Preview).height).toBe(viewportHeight);
        }
      };
      for (let visit = 0; visit < 2; visit++) {
        act(() =>
          ref.dispatch(StackActions.push('preview', { label: 'taller' }))
        );
        layout(pageFor(renderer, Preview), 500);
        // Include a spring overshoot beyond the available window.
        checkFrames([270, 420, 570, Dimensions.get('window').height + 100]);
        // The page fade may settle before a large height spring finishes.
        // Its last frame must not become the starting height of a rapid Back.
        animatedHeight.value = 550;
        act(() => mockCompletions.shift()!(true));
        expect(animatedHeight.value).toBe(570);
        act(() => ref.goBack());
        checkFrames([570, 420, 270]);
        act(() => mockCompletions.shift()!(true));
        expect(renderer.UNSAFE_root.findByType(TextInput)).toBe(input);
        expect(input.props.value).toBe('retained draft');
        expect(renderer.UNSAFE_root.findAllByType(Preview)).toHaveLength(0);
      }
      // Settled content sizes the card in native layout, without waiting for
      // an animated height or remounting the retained input.
      layout(pageFor(renderer, Form), 320);
      animatedHeight.value = 300;
      expectIntrinsicLayout(renderer, Form, 70);
      layout(pageFor(renderer, Form), NaN);
      expectIntrinsicLayout(renderer, Form, 70);
      // Empty content still leaves a correctly sized header.
      layout(pageFor(renderer, Form), 0);
      expectIntrinsicLayout(renderer, Form, 70);
    } finally {
      if (renderer) act(() => renderer.unmount());
      sharedValues.mockRestore();
      animatedStyle.mockRestore();
    }
  }
);

test('bottom alignment is independent of delayed or changed custom-header measurements', () => {
  let renderer!: RenderResult;

  renderer = renderComponent(
    <Fixture>
      <Tray.Navigator
        handleVisible={false}
        renderHeader={(props) => <CustomHeader {...props} />}
      >
        <Tray.Screen name="form" component={Form} />
        <Tray.Screen name="preview" component={Preview} />
      </Tray.Navigator>
    </Fixture>
  );

  const measureHeader = (name: string, height: number) => {
    const header = renderer.UNSAFE_root.findAllByType(CustomHeader).find(
      (node) => node.props.route.name === name
    )!;
    act(() =>
      headerFor(header).props.onLayout({ nativeEvent: { layout: { height } } })
    );
  };
  const expectBottomLayout = (component: React.ElementType) => {
    const viewport = viewportStyle(renderer, component);
    const page = StyleSheet.flatten(pageFor(renderer, component).props.style);
    expect(viewport).toMatchObject({ position: 'absolute', bottom: 0 });
    expect(viewport.transform[0].translateY).toBeCloseTo(0);
    expect(viewport.justifyContent).toBe('flex-end');
    expect(page).toMatchObject({ position: 'relative' });
    expect(viewport.top).toBeUndefined();
    expect(page.top).toBeUndefined();
  };
  act(() => openForm());
  layoutPage(renderer, Form, 320);
  expect(cardStyle(renderer).height).toBe('auto');
  measureHeader('form', 80);
  expectIntrinsicLayout(renderer, Form, 80);
  act(() => sheet(renderer).props.onSettle(1));
  act(() => ref.dispatch(StackActions.push('preview', { label: 'short' })));
  layoutPage(renderer, Preview, 200);
  // The destination still has the provisional 56-point header. Neither page
  // should translate by the difference from the measured 80-point source.
  expect(cardStyle(renderer).height).toBe(400);
  expectBottomLayout(Form);
  expectBottomLayout(Preview);
  measureHeader('preview', 110);
  act(() => mockCompletions.shift()!(true));
  expectIntrinsicLayout(renderer, Preview, 110);
  expectBottomLayout(Form);
  // Runtime header changes and Back keep the same native bottom constraints.
  measureHeader('preview', 150);
  expectIntrinsicLayout(renderer, Preview, 150);
  act(() => ref.goBack());
  expectBottomLayout(Form);
  measureHeader('form', 100);
  act(() => mockCompletions.shift()!(true));
  expectIntrinsicLayout(renderer, Form, 100);
  act(() => renderer.unmount());
});

test.each([
  ['floating', 'top'],
  ['floating', 'bottom'],
  ['sheet', 'top'],
  ['sheet', 'bottom'],
] as const)(
  'sizes a settled %s/%s composer natively while keyboard layout callbacks lag',
  (appearance, anchor) => {
    const animatedStyle = jest
      .spyOn(Reanimated, 'useAnimatedStyle')
      .mockImplementation((updater) =>
        Object.defineProperties(
          {} as ReturnType<typeof Reanimated.useAnimatedStyle>,
          Object.fromEntries(
            Object.keys(updater()).map((key) => [
              key,
              {
                enumerable: true,
                get: () => (updater() as Record<string, unknown>)[key],
              },
            ])
          )
        )
      );
    const spring = jest.spyOn(Reanimated, 'withSpring');
    const renders = jest.fn();
    function Composer() {
      renders();
      return <Form />;
    }
    let renderer!: RenderResult;
    try {
      renderer = renderComponent(
        <Fixture>
          <Tray.Navigator
            appearance={appearance}
            anchor={anchor}
            topInset={50}
            bottomInset={20}
            animation={{ type: 'spring' }}
          >
            <Tray.Screen name="form" component={Composer} />
            <Tray.Screen name="preview" component={Preview} />
          </Tray.Navigator>
        </Fixture>
      );

      act(() => openForm());
      layoutPage(renderer, Composer, 400);
      act(() => sheet(renderer).props.onSettle(1));
      const input = renderer.UNSAFE_root.findByType(TextInput);
      act(() => input.props.onChangeText('retained composer draft'));
      const renderCount = renders.mock.calls.length;
      spring.mockClear();
      const event = { height: 300, progress: 1, duration: 250, target: 1 };
      const checkFrame = (height: number) => {
        const bottom = 20 * (1 - height / 300);
        expectIntrinsicLayout(
          renderer,
          Composer,
          70,
          appearance === 'sheet' ? bottom : 0
        );
        const content = pageFor(renderer, Composer).findByType(
          Reanimated.default.View
        );
        expect(StyleSheet.flatten(content.props.style).maxHeight).toBeCloseTo(
          Dimensions.get('window').height -
            height -
            50 -
            bottom -
            (appearance === 'floating' ? 12 * (height / 300) : 0) -
            6 -
            70
        );
        expect(sheet(renderer).props.style.bottom).toBe(height);
      };
      act(() => mockKeyboardHandlers.onStart!(event));
      // No JS onLayout is delivered during these frames. The content and its
      // clipping card must still share one native layout, including reversal.
      for (const height of [60, 180, 300]) {
        act(() =>
          mockKeyboardHandlers.onMove!({
            ...event,
            height,
            progress: height / 300,
          })
        );
        checkFrame(height);
      }
      act(() => mockKeyboardHandlers.onEnd!(event));
      layoutPage(renderer, Composer, 240);
      for (const height of [180, 60, 180, 300]) {
        act(() =>
          mockKeyboardHandlers.onInteractive!({
            ...event,
            height,
            progress: height / 300,
          })
        );
        checkFrame(height);
      }
      act(() =>
        mockKeyboardHandlers.onStart!({ ...event, height: 0, progress: 0 })
      );
      for (const height of [180, 60, 0]) {
        act(() =>
          mockKeyboardHandlers.onMove!({
            ...event,
            height,
            progress: height / 300,
          })
        );
        checkFrame(height);
      }
      act(() =>
        mockKeyboardHandlers.onEnd!({ ...event, height: 0, progress: 0 })
      );
      // Even a delayed final content measurement must not restart a spring.
      layoutPage(renderer, Composer, 390);
      layoutPage(renderer, Composer, 400);
      checkFrame(0);
      expect(spring).not.toHaveBeenCalled();
      expect(renders).toHaveBeenCalledTimes(renderCount);
      expect(renderer.UNSAFE_root.findByType(TextInput)).toBe(input);
      expect(input.props.value).toBe('retained composer draft');

      // Navigation still owns an animated height; only the active settled page
      // contributes intrinsic size, so retained pages cannot enlarge the card.
      act(() => ref.dispatch(StackActions.push('preview', { label: 'next' })));
      layoutPage(renderer, Preview, 200);
      expect(spring).toHaveBeenCalled();
      expect(cardStyle(renderer).height).toBe(
        270 + (appearance === 'sheet' ? 20 : 0)
      );
      expect(viewportStyle(renderer, Composer).position).toBe('absolute');
      act(() => mockCompletions.shift()!(true));
      expectIntrinsicLayout(
        renderer,
        Preview,
        70,
        appearance === 'sheet' ? 20 : 0
      );
      expect(viewportStyle(renderer, Composer).position).toBe('absolute');
    } finally {
      if (renderer) act(() => renderer.unmount());
      spring.mockRestore();
      animatedStyle.mockRestore();
    }
  }
);

test('keyboard frames update shared geometry without rerendering React content', () => {
  let keyboard!: ReturnType<typeof useTrayKeyboard>;
  const renders = jest.fn();
  function KeyboardObserver() {
    keyboard = useTrayKeyboard();
    renders();
    return null;
  }
  let renderer!: RenderResult;

  renderer = renderComponent(<KeyboardObserver />);

  const event = { height: 150, progress: 0.5, duration: 250, target: 1 };
  act(() => mockKeyboardHandlers.onStart!(event));
  expect(keyboard.isVisible).toBe(true);
  // The accessibility visibility boundary may render once; animation frames
  // must continue on the UI thread without further React updates.
  const frames = renders.mock.calls.length;
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

test.each(['top', 'bottom'] as const)(
  'keeps a full-screen %s-anchored form aligned throughout keyboard frames',
  (anchor) => {
    const animatedStyle = jest
      .spyOn(Reanimated, 'useAnimatedStyle')
      .mockImplementation((updater) =>
        Object.defineProperties(
          {} as ReturnType<typeof Reanimated.useAnimatedStyle>,
          Object.fromEntries(
            Object.keys(updater()).map((key) => [
              key,
              {
                enumerable: true,
                get: () => (updater() as Record<string, unknown>)[key],
              },
            ])
          )
        )
      );
    const renderForm = jest.fn();
    function KeyboardForm() {
      renderForm();
      return <Form />;
    }
    let renderer!: RenderResult;
    try {
      renderer = renderComponent(
        <Fixture>
          <Tray.Navigator topInset={50} bottomInset={20} anchor={anchor}>
            <Tray.Screen
              name="form"
              component={KeyboardForm}
              options={{ presentation: 'fullScreen' }}
            />
            <Tray.Screen
              name="preview"
              component={Preview}
              options={{ presentation: 'fullScreen' }}
            />
          </Tray.Navigator>
        </Fixture>
      );

      act(() => openForm());
      const windowHeight = Dimensions.get('window').height;
      layoutPage(renderer, KeyboardForm, windowHeight - 140);
      act(() => sheet(renderer).props.onSettle(1));
      const input = renderer.UNSAFE_root.findByType(TextInput);
      act(() => input.props.onChangeText('keyboard draft'));
      const renderCount = renderForm.mock.calls.length;
      const checkLayout = (
        keyboardHeight: number,
        keyboardProgress: number
      ) => {
        const card = cardStyle(renderer);
        const viewport = viewportStyle(renderer, KeyboardForm);
        const page = StyleSheet.flatten(
          pageFor(renderer, KeyboardForm).props.style
        );
        let content = renderer.UNSAFE_root.findByType(KeyboardForm).parent!;
        while (content.type !== Reanimated.default.View)
          content = content.parent!;
        const contentStyle = StyleSheet.flatten(content.props.style);
        const bottom = 20 * (1 - keyboardProgress);
        const keyboardSurface = renderer.UNSAFE_root.findAllByType(
          Reanimated.default.View
        ).find(
          (view) =>
            view.props.pointerEvents === 'none' &&
            StyleSheet.flatten(view.props.style)?.backgroundColor
        )!;
        expect(StyleSheet.flatten(keyboardSurface.props.style)).toMatchObject({
          bottom: 0,
          height: keyboardHeight,
          opacity: 1,
        });
        expect(sheet(renderer).props.style.bottom).toBe(keyboardHeight);
        expect(card.height).toBe(windowHeight - keyboardHeight);
        expect(viewport.height).toBe(
          windowHeight - keyboardHeight - 120 - bottom
        );
        // All three boxes must resize together; an old fixed height on either
        // descendant would still push the form above the header.
        expect(page.height).toBe('100%');
        expect(contentStyle.height).toBe('100%');
        expect(page.maxHeight).toBeUndefined();
        expect(contentStyle.maxHeight).toBeUndefined();
        const viewportTop =
          anchor === 'bottom' ? card.height - viewport.height : 0;
        expect(viewportTop + viewport.transform[0].translateY).toBeCloseTo(120);
        expect(renderForm).toHaveBeenCalledTimes(renderCount);
        expect(renderer.UNSAFE_root.findByType(TextInput)).toBe(input);
        expect(input.props.value).toBe('keyboard draft');
      };
      const event = { height: 300, progress: 1, duration: 250, target: 1 };
      checkLayout(0, 0);
      act(() => mockKeyboardHandlers.onStart!(event));
      checkLayout(0, 0);
      for (const height of [75, 150, 225, 300]) {
        act(() =>
          mockKeyboardHandlers.onMove!({
            ...event,
            height,
            progress: height / 300,
          })
        );
        checkLayout(height, height / 300);
        // Fabric may deliver an intermediate onLayout while React still holds
        // the previous settled keyboard height.
        layoutPage(renderer, KeyboardForm, windowHeight - height - 140);
        checkLayout(height, height / 300);
      }
      act(() => mockKeyboardHandlers.onEnd!(event));
      checkLayout(300, 1);
      // Interactive cancellation and keyboard type/height changes use the
      // same live viewport without waiting for a React settlement update.
      act(() =>
        mockKeyboardHandlers.onInteractive!({
          ...event,
          height: 150,
          progress: 0.5,
        })
      );
      checkLayout(150, 0.5);
      act(() => mockKeyboardHandlers.onMove!(event));
      checkLayout(300, 1);
      act(() => mockKeyboardHandlers.onMove!({ ...event, height: 340 }));
      checkLayout(340, 1);
      act(() => mockKeyboardHandlers.onEnd!({ ...event, height: 340 }));
      checkLayout(340, 1);
      act(() =>
        mockKeyboardHandlers.onStart!({ ...event, height: 0, progress: 0 })
      );
      checkLayout(340, 1);
      for (const height of [255, 170, 85, 0]) {
        act(() =>
          mockKeyboardHandlers.onMove!({
            ...event,
            height,
            progress: height / 340,
          })
        );
        checkLayout(height, height / 340);
      }
      act(() =>
        mockKeyboardHandlers.onEnd!({ ...event, height: 0, progress: 0 })
      );
      checkLayout(0, 0);
      // A newly pushed full-screen page must use the live keyboard viewport,
      // including when onStart resets React's layout height before dismissal.
      act(() => mockKeyboardHandlers.onEnd!(event));
      act(() =>
        ref.dispatch(StackActions.push('preview', { label: 'next page' }))
      );
      layoutPage(renderer, Preview, windowHeight - 420);
      expect(viewportStyle(renderer, Preview).height).toBe(windowHeight - 420);
      act(() =>
        mockKeyboardHandlers.onStart!({ ...event, height: 0, progress: 0 })
      );
      expect(viewportStyle(renderer, Preview).height).toBe(windowHeight - 420);
      for (const height of [225, 150, 75, 0]) {
        act(() =>
          mockKeyboardHandlers.onMove!({
            ...event,
            height,
            progress: height / 300,
          })
        );
        checkLayout(height, height / 300);
        expect(viewportStyle(renderer, Preview).height).toBe(
          viewportStyle(renderer, KeyboardForm).height
        );
      }
      act(() =>
        mockKeyboardHandlers.onEnd!({ ...event, height: 0, progress: 0 })
      );
      act(() => mockCompletions.shift()!(true));
      act(() => ref.goBack());
      act(() => mockCompletions.shift()!(true));
      checkLayout(0, 0);
    } finally {
      if (renderer) act(() => renderer.unmount());
      animatedStyle.mockRestore();
    }
  }
);

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
    let renderer!: RenderResult;
    try {
      renderer = renderComponent(
        <Fixture>
          <Tray.Navigator
            appearance={mode === 'sheet' ? 'sheet' : 'floating'}
            topInset={50}
            bottomInset={20}
            keyboardInset={8}
          >
            <Tray.Screen
              name="form"
              component={Form}
              options={{
                presentation: mode === 'fullScreen' ? 'fullScreen' : 'tray',
              }}
            />
          </Tray.Navigator>
        </Fixture>
      );

      act(() => openForm());
      const card = () => cardStyle(renderer);
      layoutPage(
        renderer,
        Form,
        mode === 'fullScreen' ? 660 : mode === 'sheet' ? 110 : 130
      );
      const event = { height: 300, progress: 1, duration: 250, target: 1 };
      expect(card().marginBottom).toBe(mode === 'floating' ? 20 : 0);
      act(() => mockKeyboardHandlers.onEnd!(event));
      expect(card().marginBottom).toBe(mode === 'floating' ? 8 : 0);
      expect(sheet(renderer).props.style.bottom).toBe(300);
      expect(card().height).toBe(mode === 'fullScreen' ? 500 : 'auto');
      if (mode === 'fullScreen')
        expect(viewportStyle(renderer, Form).height).toBe(380);
      else expectIntrinsicLayout(renderer, Form, 70);
      act(() =>
        mockKeyboardHandlers.onEnd!({ ...event, height: 0, progress: 0 })
      );
      expect(card().marginBottom).toBe(mode === 'floating' ? 20 : 0);
      expect(card().height).toBe(mode === 'fullScreen' ? 800 : 'auto');
      if (mode !== 'fullScreen')
        expectIntrinsicLayout(renderer, Form, 70, mode === 'sheet' ? 20 : 0);
      expect(sheet(renderer).props.style.bottom).toBe(0);
      expect(
        renderer.UNSAFE_root.findByProps({ testID: 'draft' }).props.value
      ).toBe('draft');
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
    let renderer!: RenderResult;

    renderer = renderComponent(
      <Fixture>
        <Tray.Navigator
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
        </Tray.Navigator>
      </Fixture>
    );

    const card = () => cardStyle(renderer);
    const viewport = () =>
      viewportStyle(
        renderer,
        currentRoute()?.name === 'preview' ? Preview : Form
      );
    const window = Dimensions.get('window');
    act(() => openForm());
    layoutPage(renderer, Form, appearance === 'sheet' ? 110 : 130);
    act(() => sheet(renderer).props.onSettle(1));
    act(() =>
      renderer.UNSAFE_root.findByType(TextInput).props.onChangeText('edited')
    );
    act(() =>
      ref.dispatch(StackActions.push('preview', { label: 'full screen' }))
    );
    layoutPage(renderer, Preview, window.height - topInset - 90);
    expect(viewport().width).toBe(window.width);
    expect(viewport().height).toBe(window.height - topInset - 90);
    const page = pageFor(renderer, Preview);
    expect(StyleSheet.flatten(page.props.style)).toMatchObject({
      height: '100%',
    });
    expect(renderer.UNSAFE_root.findAllByType(Form)).toHaveLength(1);
    act(() => mockCompletions.shift()!(true));
    expect(viewport().bottom).toBe(0);
    expect(viewport().transform).toEqual([{ translateY: -20 }]);
    expect(card()).toMatchObject({
      height: window.height,
      marginHorizontal: 0,
      marginBottom: 0,
      borderRadius: 0,
    });

    act(() => ref.goBack());
    layoutPage(renderer, Form, appearance === 'sheet' ? 110 : 130);
    expect(renderer.UNSAFE_root.findAllByType(Preview)).toHaveLength(1);
    act(() => mockCompletions.shift()!(true));
    expectIntrinsicLayout(renderer, Form, 70, appearance === 'sheet' ? 20 : 0);
    expect(renderer.UNSAFE_root.findAllByType(Preview)).toHaveLength(0);
    expect(renderer.UNSAFE_root.findByType(TextInput).props.value).toBe(
      'edited'
    );
    expect(card()).toMatchObject({
      height: 'auto',
      marginHorizontal: appearance === 'floating' ? 16 : 0,
      marginBottom: appearance === 'floating' ? 20 : 0,
      borderRadius: 30,
    });
    act(() => renderer.unmount());
  }
);

test('uses the new transition start visibility for pushed and retained Back pages', () => {
  let renderer!: RenderResult;

  renderer = renderComponent(<Fixture>{stack()}</Fixture>);

  const opacity = (component: React.ElementType) => {
    const page = pageFor(renderer, component);
    let node = renderer.UNSAFE_root.findByType(component).parent;
    let value = 1;
    while (node && node !== page.parent) {
      value *= StyleSheet.flatten(node.props.style)?.opacity ?? 1;
      node = node.parent;
    }
    return value;
  };
  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  expect(opacity(Form)).toBe(1);

  act(() => ref.dispatch(StackActions.push('preview', { label: 'next' })));
  expect(opacity(Preview)).toBe(0);
  expect(opacity(Form)).toBe(1);
  const forwardComplete = mockCompletions.shift()!;
  act(() => forwardComplete(true));
  expect(opacity(Preview)).toBe(1);
  expect(opacity(Form)).toBe(0);

  act(() => ref.goBack());
  expect(opacity(Form)).toBe(0);
  expect(opacity(Preview)).toBe(1);
  act(() => forwardComplete(true));
  expect(opacity(Form)).toBe(0);
  act(() => mockCompletions.shift()!(true));
  expect(opacity(Form)).toBe(1);
  expect(renderer.UNSAFE_root.findAllByType(Preview)).toHaveLength(0);
  act(() => renderer.unmount());
});

test('retains the same content header across a push and Back while reporting both endpoints', () => {
  function Artwork({ from, to }: { from: string; to: string }) {
    return <Text>{from + ' to ' + to}</Text>;
  }
  const renderer = renderComponent(
    <Fixture>
      <Tray.Navigator renderContentHeader={(props) => <Artwork {...props} />}>
        <Tray.Screen
          name="form"
          component={Form}
          options={{ contentHeaderHeight: 200 }}
        />
        <Tray.Screen
          name="preview"
          component={Preview}
          options={{ contentHeaderHeight: 100 }}
        />
      </Tray.Navigator>
    </Fixture>
  );
  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  const artwork = renderer.UNSAFE_getByType(Artwork);
  act(() => ref.dispatch(StackActions.push('preview', { label: 'Next' })));
  expect(renderer.UNSAFE_getByType(Artwork)).toBe(artwork);
  expect(renderer.getByText('form to preview')).toBeTruthy();
  act(() => mockCompletions.shift()!(true));
  act(() => ref.goBack());
  expect(renderer.UNSAFE_getByType(Artwork)).toBe(artwork);
  expect(renderer.getByText('preview to form')).toBeTruthy();
  renderer.unmount();
});

test('activates only the destination boundary and retains the outgoing route through Back', () => {
  const view = renderComponent(<Fixture>{stack()}</Fixture>);
  const active = () =>
    view.UNSAFE_root.findAllByType(Reanimated.SharedTransitionBoundary).map(
      (node) => node.props.isActive
    );
  act(() => openForm());
  act(() => sheet(view).props.onSettle(1));
  expect(active()).toEqual([true]);
  act(() => ref.dispatch(StackActions.push('preview', { label: 'detail' })));
  expect(active()).toEqual([false, true]);
  act(() => mockCompletions.shift()!(true));
  act(() => ref.goBack());
  expect(active().sort()).toEqual([false, true]);
  act(() => mockCompletions.shift()!(true));
  expect(active()).toEqual([true]);
  view.unmount();
});

test('presents a full-screen root and shrinks for a pushed content-sized page', () => {
  let renderer!: RenderResult;

  renderer = renderComponent(
    <Fixture>
      <Tray.Navigator topInset={50} bottomInset={20}>
        <Tray.Screen name="form" component={Form} />
        <Tray.Screen
          name="preview"
          component={Preview}
          options={{ presentation: 'fullScreen' }}
        />
      </Tray.Navigator>
    </Fixture>
  );

  act(() => openPreview('root'));
  layoutPage(
    renderer,
    currentRoute()?.name === 'preview' ? Preview : Form,
    currentRoute()?.name === 'preview'
      ? Dimensions.get('window').height - 140
      : 130
  );
  expect(cardStyle(renderer)).toMatchObject({
    height: Dimensions.get('window').height,
    marginHorizontal: 0,
    marginBottom: 0,
  });
  act(() => sheet(renderer).props.onSettle(1));
  act(() => ref.dispatch(StackActions.push('form')));
  expect(
    StyleSheet.flatten(pageFor(renderer, Preview).props.style)
  ).toMatchObject({
    height: '100%',
    width: Dimensions.get('window').width,
  });
  layoutPage(
    renderer,
    currentRoute()?.name === 'preview' ? Preview : Form,
    currentRoute()?.name === 'preview'
      ? Dimensions.get('window').height - 140
      : 130
  );
  act(() => mockCompletions.shift()!(true));
  expect(cardStyle(renderer)).toMatchObject({
    height: 'auto',
    marginHorizontal: 16,
    marginBottom: 20,
  });
  act(() => ref.goBack());
  layoutPage(
    renderer,
    currentRoute()?.name === 'preview' ? Preview : Form,
    currentRoute()?.name === 'preview'
      ? Dimensions.get('window').height - 140
      : 130
  );
  act(() => mockCompletions.shift()!(true));
  expect(cardStyle(renderer).height).toBe(Dimensions.get('window').height);
  expect(renderer.UNSAFE_root.findAllByType(Preview)).toHaveLength(1);
  act(() => renderer.unmount());
});

test('preserves drafts across rerenders and Back, releasing popped views only on completion', () => {
  let renderer!: RenderResult;
  const render = () => <Fixture>{stack()}</Fixture>;

  renderer = renderComponent(render());

  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  act(() =>
    renderer.UNSAFE_root.findByType(TextInput).props.onChangeText('edited')
  );
  act(() => ref.dispatch(StackActions.push('preview', { label: 'hello' })));
  expect(renderer.UNSAFE_root.findAllByType(Form)).toHaveLength(1);
  expect(renderer.UNSAFE_root.findAllByType(Preview)).toHaveLength(1);
  expect(unmounted).toEqual([]);
  act(() => renderer.rerender(render()));
  expect(mockCompletions).toHaveLength(1);
  act(() => mockCompletions.shift()!(true));
  act(() => ref.goBack());
  const complete = mockCompletions.shift()!;
  act(() => complete(false));
  expect(renderer.UNSAFE_root.findAllByType(Preview)).toHaveLength(1);
  act(() => complete(true));
  expect(renderer.UNSAFE_root.findAllByType(Preview)).toHaveLength(0);
  expect(renderer.UNSAFE_root.findByType(TextInput).props.value).toBe('edited');
  expect(unmounted).not.toContain('form');
  act(() => renderer.unmount());
});

function headerFor(node: RenderResult['UNSAFE_root']) {
  let ancestor = node.parent;
  while (ancestor && typeof ancestor.props.onLayout !== 'function')
    ancestor = ancestor.parent;
  if (!ancestor) throw new Error('Header layout view not found');
  return ancestor;
}

function pageFor(renderer: RenderResult, component: React.ElementType) {
  let node = renderer.UNSAFE_root.findByType(component).parent!;
  while (node.props.accessibilityElementsHidden === undefined)
    node = node.parent!;
  return node;
}

function cardStyle(renderer: RenderResult) {
  const card = sheet(renderer)
    .findAllByType(Reanimated.default.View)
    .find(
      (node) => StyleSheet.flatten(node.props.style)?.overflow === 'hidden'
    )!;
  return StyleSheet.flatten(card.props.style);
}
function viewportStyle(renderer: RenderResult, component: React.ElementType) {
  let node = pageFor(renderer, component).parent!;
  while (node.type !== Reanimated.default.View) node = node.parent!;
  return StyleSheet.flatten(node.props.style);
}

function expectIntrinsicLayout(
  renderer: RenderResult,
  component: React.ElementType,
  headerHeight: number,
  bottomInset = 0
) {
  expect(cardStyle(renderer).height).toBe('auto');
  expect(viewportStyle(renderer, component)).toMatchObject({
    position: 'relative',
    height: 'auto',
    paddingTop: headerHeight,
    paddingBottom: bottomInset,
    transform: [{ translateY: 0 }],
  });
  const page = StyleSheet.flatten(pageFor(renderer, component).props.style);
  expect(page.position).toBe('relative');
  expect(page.height).toBeUndefined();
  expect(page.maxHeight).toBeUndefined();
}

function layoutPage(
  renderer: RenderResult,
  component: React.ElementType,
  height: number
) {
  act(() =>
    pageFor(renderer, component).props.onLayout({
      nativeEvent: { layout: { height } },
    })
  );
}

test('restores a linked nested route, releases its parent on native settlement and ignores stale close callbacks', () => {
  const linked = getStateFromPath<ParentRoutes>('/note/hello', {
    initialRouteName: 'home',
    screens: {
      home: '',
      tray: {
        initialRouteName: 'form',
        screens: { form: 'compose', preview: 'note/:label' },
      },
    },
  });
  const renderer = renderComponent(
    <Fixture initialState={linked}>{stack()}</Fixture>
  );
  expect(currentRoute()).toMatchObject({
    name: 'preview',
    params: { label: 'hello' },
  });
  const root = ref.getRootState();
  expect(root.routes.map((r) => r.name)).toEqual(['home', 'tray']);
  expect(root.routes[1]?.state?.routes.map((r) => r.name)).toEqual([
    'form',
    'preview',
  ]);
  const nativeSettle = sheet(renderer).props.onSettle;
  act(() => nativeSettle(1));
  act(() => ref.goBack());
  expect(currentRoute()!.name).toBe('form');
  act(() => mockCompletions.shift()!(true));
  act(() => ref.goBack());
  expect(ref.getRootState().routes.at(-1)?.name).toBe('tray');
  expect(renderer.queryByLabelText('Open tray')).toBeNull();
  expect(renderer.getByDisplayValue('draft')).toBeTruthy();
  act(() => nativeSettle(0));
  expect(currentRoute()!.name).toBe('home');
  fireEvent.press(renderer.getByLabelText('Open tray'));
  expect(currentRoute()!.name).toBe('form');
  act(() => nativeSettle(0));
  expect(ref.getRootState().routes.at(-1)?.name).toBe('tray');
  expect(sheet(renderer).props.index).toBe(1);
  renderer.unmount();
});

test('accepts another tray launch when the backdrop clears while the previous spring finishes', () => {
  const f = lifecycleFixture();
  act(() => openForm());
  act(() => sheet(f.renderer).props.onSettle(1));
  act(() => dismissTray());
  const closing = sheet(f.renderer).props;
  act(() =>
    closing.onPositionChange({ nativeEvent: { position: 8, index: 0.03 } })
  );
  expect(currentRoute()?.name).toBe('form');
  act(() =>
    closing.onPositionChange({ nativeEvent: { position: 2, index: 0.005 } })
  );
  expect(currentRoute()?.name).toBe('home');
  expect(f.callbacks.onDismiss).not.toHaveBeenCalled();
  fireEvent.press(f.renderer.getByLabelText('Open tray'));
  expect(currentRoute()?.name).toBe('form');
  act(() => closing.onIndexChange(0));
  act(() => closing.onSettle(0));
  expect(f.callbacks.onDismiss).toHaveBeenCalledTimes(1);
  expect(sheet(f.renderer).props.index).toBe(1);
  act(() => closing.onSettle(0));
  expect(f.callbacks.onDismiss).toHaveBeenCalledTimes(1);
  f.renderer.unmount();
});

test('nested focus follows the parent and settled focus waits for native opening and queued page transitions', () => {
  function Page({ navigation, route }: TrayScreenProps<Routes>) {
    const focused = useIsFocused();
    const settled = useTraySettled();
    const keyboard = usePageKeyboard();
    const dismiss = useTrayDismiss();
    return (
      <View>
        <Text testID={route.key}>
          {[focused, settled, keyboard.isVisible].join('/')}
        </Text>
        <Pressable
          testID={'push-' + route.key}
          onPress={() => navigation.push('preview', { label: 'next' })}
        />
        <Pressable testID={'close-' + route.key} onPress={dismiss} />
      </View>
    );
  }
  const renderer = renderComponent(
    <Fixture>
      <Tray.Navigator>
        <Tray.Screen name="form" component={Page} />
        <Tray.Screen name="preview" component={Page} />
      </Tray.Navigator>
    </Fixture>
  );
  act(() => openForm());
  const formKey = currentRoute()!.key;
  const status = (key: string) =>
    renderer.getByTestId(key, { includeHiddenElements: true }).props.children;
  expect(status(formKey)).toBe('true/false/false');
  act(() => sheet(renderer).props.onSettle(1));
  expect(status(formKey)).toBe('true/true/false');
  act(() => ref.navigate('outside'));
  expect(status(formKey)).toBe('false/false/false');
  act(() => ref.goBack());
  expect(status(formKey)).toBe('true/true/false');
  fireEvent.press(renderer.getByTestId('push-' + formKey));
  const first = currentRoute()!.key;
  const incoming = renderer.getByTestId('push-' + first);
  act(() => {
    fireEvent.press(incoming);
    fireEvent.press(incoming);
  });
  const second = currentRoute()!.key;
  expect(ref.getRootState().routes.at(-1)?.state?.routes).toHaveLength(3);
  expect(renderer.queryByTestId(second)).toBeNull();
  act(() => mockCompletions.shift()!(true));
  expect(status(second)).toBe('true/false/false');
  act(() => mockCompletions.shift()!(true));
  expect(status(second)).toBe('true/true/false');
  fireEvent.press(renderer.getByTestId('close-' + second));
  act(() => sheet(renderer).props.onSettle(0));
  expect(currentRoute()!.name).toBe('home');
  renderer.unmount();
});

test('a child removal guard can veto a sheet drag before its parent route closes', () => {
  const guarded = jest.fn();
  function UnsavedForm() {
    usePreventRemove(true, guarded);
    return <Text>Unsaved</Text>;
  }
  const renderer = renderComponent(
    <Fixture>
      <Tray.Navigator>
        <Tray.Screen name="form" component={UnsavedForm} />
      </Tray.Navigator>
    </Fixture>
  );
  act(() => openForm());
  act(() => sheet(renderer).props.onSettle(1));
  act(() => {
    sheet(renderer).props.onIndexChange(0);
    sheet(renderer).props.onSettle(0);
  });
  expect(guarded).toHaveBeenCalledTimes(1);
  expect(currentRoute()!.name).toBe('form');
  expect(sheet(renderer).props.index).toBe(1);
  renderer.unmount();
});

test('Expo tray uses the enclosing Expo Router navigation context for routes and focus', () => {
  const expo = jest.requireActual<
    typeof import('expo-router/react-navigation')
  >('expo-router/react-navigation');
  const {
    createTrayNavigator: createExpoTray,
    useTraySettled: useExpoTraySettled,
  } = jest.requireActual<typeof import('../entries/expo-router-tray')>(
    '../entries/expo-router-tray'
  );
  const {
    RoutingQueueProvider,
  } = require('expo-router/build/global-state/routingQueueContext');
  const {
    RemovalPreventionProvider,
  } = require('expo-router/build/global-state/removalPrevention');
  const {
    BaseNavigationContainer: ExpoContainer,
  } = require('expo-router/build/react-navigation/core/BaseNavigationContainer');
  const Child = createExpoTray<Routes>();
  const parentRef = expo.createNavigationContainerRef<ParentRoutes>();
  function ExpoStack({ children }: { children: React.ReactNode }) {
    const { state, descriptors, NavigationContent } = expo.useNavigationBuilder(
      expo.StackRouter,
      { children }
    );
    return (
      <NavigationContent>
        {state.routes.map((route) => descriptors[route.key]!.render())}
      </NavigationContent>
    );
  }
  const Root = expo.createNavigatorFactory(ExpoStack)();
  function ExpoPreview() {
    const route =
      expo.useRoute<
        import('expo-router/react-navigation').RouteProp<Routes, 'preview'>
      >();
    return <Text>{useExpoTraySettled() ? route.params.label : 'Opening'}</Text>;
  }
  function ExpoTrayScreen() {
    return (
      <Child.Navigator>
        <Child.Screen name="form" component={Form} />
        <Child.Screen name="preview" component={ExpoPreview} />
      </Child.Navigator>
    );
  }
  const view = renderComponent(
    <RoutingQueueProvider>
      <RemovalPreventionProvider>
        <ExpoContainer
          ref={parentRef}
          initialState={{
            stale: false,
            key: 'root',
            type: 'stack',
            routeKeySeq: 2,
            index: 1,
            routeNames: ['home', 'tray'],
            routes: [
              { key: 'home-0', name: 'home' },
              {
                key: 'tray-1',
                name: 'tray',
                state: {
                  stale: false,
                  key: 'child',
                  type: 'stack',
                  routeKeySeq: 1,
                  index: 0,
                  routeNames: ['form', 'preview'],
                  routes: [
                    {
                      name: 'preview',
                      key: 'preview-0',
                      params: { label: 'Expo preview' },
                    },
                  ],
                },
              },
            ],
          }}
        >
          <Root.Navigator>
            <Root.Screen name="home" component={Empty} />
            <Root.Screen name="tray" component={ExpoTrayScreen} />
          </Root.Navigator>
        </ExpoContainer>
      </RemovalPreventionProvider>
    </RoutingQueueProvider>
  );
  expect(parentRef.getCurrentRoute()?.name).toBe('preview');
  act(() => sheet(view).props.onSettle(1));
  expect(view.getByText('Expo preview')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Close tray'));
  act(() => sheet(view).props.onSettle(0));
  expect(parentRef.getCurrentRoute()?.name).toBe('home');
  view.unmount();
});

test('a parent reset replays its original destination after native dismissal', () => {
  const view = renderComponent(<Fixture>{stack()}</Fixture>);
  act(() => openForm());
  act(() => sheet(view).props.onSettle(1));
  act(() => ref.resetRoot({ index: 0, routes: [{ name: 'outside' }] }));
  expect(currentRoute()?.name).toBe('form');
  expect(sheet(view).props.index).toBe(0);
  act(() => sheet(view).props.onSettle(0));
  expect(ref.getRootState().routes.map((route) => route.name)).toEqual([
    'outside',
  ]);
  view.unmount();
});

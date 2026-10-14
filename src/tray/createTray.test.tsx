import React, { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, TextInput, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { createTray } from './createTray';
import type { TrayNavigation, TrayScreenProps } from './types';

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
jest.mock('react-native-worklets', () => ({
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
const unmounted: string[] = [];
function Observer() {
  navigation = Tray.useTray();
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
  expect(navigation.route?.name).toBe('form');
  act(() => mockCompletions.shift()!(true));
  act(() => button('Close tray').props.onPress());
  expect(sheet(renderer).props.index).toBe(0);
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => sheet(renderer).props.onSettle(0));
  expect(onDismiss).toHaveBeenCalledTimes(1);
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

test.each(['floating', 'sheet'] as const)(
  'expands a middle screen and restores %s geometry and form state on Back',
  (appearance) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Tray.Provider>
          <Observer />
          <Tray.Stack appearance={appearance} topInset={50} bottomInset={20}>
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
    expect(viewport().height).toBe(window.height);
    expect(content().props.style).toEqual({
      paddingTop: 50,
      paddingBottom: 20,
    });
    const page = renderer.root.findByType(Preview).parent!;
    expect(StyleSheet.flatten(page.props.style)).toMatchObject({
      height: window.height - 140,
    });
    expect(renderer.root.findAllByType(Form)).toHaveLength(1);
    act(() => mockCompletions.shift()!(true));
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
    StyleSheet.flatten(renderer.root.findByType(Preview).parent!.props.style)
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
  expect(navigation.route?.name).toBe('preview');
  act(() => oldSettled(0));
  expect(navigation.isPresented).toBe(true);
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
  expect(navigation.isPresented).toBe(false);
  act(() => renderer.unmount());
});

test.each(['separate factories', 'the same factory'])(
  'isolates nested provider stacks using %s',
  (definition) => {
    const InnerTray =
      definition === 'the same factory' ? Tray : createTray<Routes>();
    let outer!: TrayNavigation<Routes>;
    let inner!: TrayNavigation<Routes>;
    const outerDismissed = jest.fn();
    const innerDismissed = jest.fn();
    function OuterObserver() {
      outer = Tray.useTray();
      return null;
    }
    function InnerObserver() {
      inner = InnerTray.useTray();
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
    expect(outer.depth).toBe(2);
    expect(inner.depth).toBe(0);
    expect(inner.isPresented).toBe(false);
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
    expect(outer.depth).toBe(0);
    expect(outer.isPresented).toBe(false);
    expect(inner.depth).toBe(2);
    expect(inner.route?.params).toEqual({ label: 'inner' });
    act(() => inner.back());
    act(() => mockCompletions.shift()!(true));
    expect(inner.depth).toBe(1);
    expect(inner.route?.name).toBe('form');
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
  expect(navigation.isPresented).toBe(false);
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

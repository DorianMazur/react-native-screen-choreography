import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { createTray } from './createTray';
import { useTrayKeyboard } from './useTrayKeyboard';
import { useTrayGeometry } from './TrayChoreography';
import { TrayHeaderLayer } from './TrayHeaderLayer';
import * as TrayChoreographyModule from './TrayChoreography';
import { TransitionCoordinator } from '../core/TransitionCoordinator';
import type { KeyboardHandler } from 'react-native-keyboard-controller';
import type {
  TrayHeaderProps,
  TrayNavigation,
  TrayScreenProps,
  TrayStackProps,
  TrayState,
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
  <Tray.Screen
    name="preview"
    component={Preview}
    options={{
      renderHeader: ({ route, tray }) => {
        const label: string = route.params.label;
        // @ts-expect-error Header navigation retains destination parameter checking.
        tray.push('preview', { missing: true });
        return <Text>{label}</Text>;
      },
    }}
  />;
  <Tray.Stack
    renderHeader={({ route }) => {
      if (route.name === 'preview') {
        const label: string = route.params.label;
        return <Text>{label}</Text>;
      }
      return null;
    }}
  >
    {null}
  </Tray.Stack>;
}

export function checkFocusEffectTypes() {
  type Effect = Parameters<typeof Tray.useFocusEffect>[0];
  const withoutCleanup: Effect = () => {};
  const withCleanup: Effect = () => () => {};
  // @ts-expect-error Async work belongs inside the effect, not in its return value.
  const asyncEffect: Effect = async () => {};
  // @ts-expect-error Effects can only return a cleanup function or nothing.
  const invalidCleanup: Effect = () => 1;
  return { withoutCleanup, withCleanup, asyncEffect, invalidCleanup };
}

export function checkPushTypes(
  tray: TrayNavigation<{
    Position: undefined;
    Add: { amount: number };
    CashOut: { amount: number } | undefined;
  }>
) {
  const result: void = tray.push('Add', { amount: 5 }, { groupId: 'chart' });
  tray.push('Position');
  tray.push('CashOut');
  tray.push('CashOut', { amount: 5 });
  tray.push('CashOut', undefined, { groupId: 'chart' });
  // @ts-expect-error Required destination params cannot be omitted.
  tray.push('Add');
  // @ts-expect-error Required destination params cannot be undefined.
  tray.push('Add', undefined);
  // @ts-expect-error Route names and params remain correlated.
  tray.push('Position', { amount: 5 });
  // @ts-expect-error Parameter types are inferred from the route.
  tray.push('Add', { amount: '5' });
  // @ts-expect-error Unknown routes are rejected.
  tray.push('Missing');
  // @ts-expect-error Options still require a group.
  tray.push('Position', undefined, {});
  return result;
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

function lifecycleFixture() {
  const events: string[] = [];
  const callbacks = {
    onWillPresent: jest.fn(() => events.push('willPresent')),
    onPresent: jest.fn(() => events.push('present')),
    onWillDismiss: jest.fn(() => events.push('willDismiss')),
    onDismiss: jest.fn(() => events.push('dismiss')),
  };
  const render = (options: Partial<TrayStackProps<Routes>> = callbacks) => (
    <Tray.Provider>
      <Observer />
      {React.cloneElement(stack(), options)}
    </Tray.Provider>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(render());
  });
  return { renderer, render, events, callbacks };
}

test('tray lifecycle distinguishes opening from native settlement and ignores layout settlements', () => {
  const f = lifecycleFixture();
  expect(f.events).toEqual([]);
  act(() => navigation.present('form'));
  expect(f.events).toEqual(['willPresent']);
  expect(navigationState.isPresented).toBe(true);
  // A drag can target the open detent before the first opening settles.
  act(() => sheet(f.renderer).props.onIndexChange(1));
  expect(f.events).toEqual(['willPresent']);
  act(() => sheet(f.renderer).props.onSettle(1));
  expect(f.events).toEqual(['willPresent', 'present']);
  act(() => sheet(f.renderer).props.onSettle(1));
  act(() => navigation.push('preview', { label: 'next' }));
  act(() => mockCompletions.shift()!(true));
  act(() => sheet(f.renderer).props.onSettle(1));
  act(() => navigation.back());
  act(() => mockCompletions.shift()!(true));
  act(() => navigation.present('preview', { label: 'new root' }));
  act(() => mockCompletions.shift()!(true));
  expect(f.events).toEqual(['willPresent', 'present']);
  act(() => navigation.dismiss());
  act(() => navigation.dismiss());
  act(() => sheet(f.renderer).props.onIndexChange(0));
  expect(f.events).toEqual(['willPresent', 'present', 'willDismiss']);
  expect(navigationState.isPresented).toBe(true);
  act(() => sheet(f.renderer).props.onSettle(0));
  expect(f.events).toEqual([
    'willPresent',
    'present',
    'willDismiss',
    'dismiss',
  ]);
  expect(navigationState.isPresented).toBe(false);
  act(() => f.renderer.unmount());
});

test('dismissal during opening suppresses onPresent and stale callbacks cannot affect reopening', () => {
  const f = lifecycleFixture();
  act(() => navigation.present('form'));
  const oldSheet = sheet(f.renderer).props;
  act(() => navigation.dismiss());
  act(() => oldSheet.onSettle(1));
  act(() => navigation.present('preview', { label: 'reopened' }));
  expect(f.events).toEqual(['willPresent', 'willDismiss']);
  act(() => oldSheet.onSettle(0));
  expect(f.events).toEqual([
    'willPresent',
    'willDismiss',
    'dismiss',
    'willPresent',
  ]);
  act(() => {
    oldSheet.onIndexChange(0);
    oldSheet.onIndexChange(1);
    oldSheet.onSettle(0);
    oldSheet.onSettle(1);
  });
  expect(f.events).toHaveLength(4);
  act(() => sheet(f.renderer).props.onSettle(1));
  expect(f.events.at(-1)).toBe('present');
  act(() => f.renderer.unmount());
});

test('a cancelled closing gesture does not dismiss or present again', () => {
  const f = lifecycleFixture();
  act(() => navigation.present('form'));
  act(() => sheet(f.renderer).props.onSettle(1));
  // A drag released back to open is not a dismissal attempt.
  act(() => sheet(f.renderer).props.onIndexChange(1));
  act(() => sheet(f.renderer).props.onSettle(1));
  expect(f.events).toEqual(['willPresent', 'present']);
  act(() => sheet(f.renderer).props.onIndexChange(0));
  act(() => sheet(f.renderer).props.onIndexChange(1));
  act(() => sheet(f.renderer).props.onSettle(0));
  act(() => sheet(f.renderer).props.onSettle(1));
  expect(f.events).toEqual(['willPresent', 'present', 'willDismiss']);
  expect(navigationState.isPresented).toBe(true);
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

test('Back queued during opening reports presentation before dismissal begins', () => {
  const f = lifecycleFixture();
  act(() => navigation.present('form'));
  act(() => navigation.back());
  expect(f.events).toEqual(['willPresent']);
  act(() => sheet(f.renderer).props.onSettle(1));
  expect(f.events).toEqual(['willPresent', 'present', 'willDismiss']);
  act(() => sheet(f.renderer).props.onSettle(0));
  expect(f.events.at(-1)).toBe('dismiss');
  act(() => f.renderer.unmount());
});

test('batched native events retain their order and callback updates do not replay events', () => {
  const f = lifecycleFixture();
  act(() => navigation.present('form'));
  const updated = {
    ...f.callbacks,
    onPresent: jest.fn(() => f.events.push('updatedPresent')),
    onDismiss: jest.fn(() => {
      expect(f.renderer.root.findAllByType(Form)).toHaveLength(0);
      f.events.push('dismiss');
    }),
  };
  act(() => f.renderer.update(f.render(updated)));
  expect(f.events).toEqual(['willPresent']);
  const native = sheet(f.renderer).props;
  act(() => {
    native.onSettle(1);
    native.onIndexChange(0);
    native.onSettle(0);
    native.onSettle(0);
  });
  expect(f.events).toEqual([
    'willPresent',
    'updatedPresent',
    'willDismiss',
    'dismiss',
  ]);
  expect(f.callbacks.onPresent).not.toHaveBeenCalled();
  expect(updated.onPresent).toHaveBeenCalledTimes(1);
  expect(updated.onDismiss).toHaveBeenCalledTimes(1);
  act(() => f.renderer.unmount());
});

test('lifecycle callbacks can navigate and unmounting does not synthesize dismissal events', () => {
  const f = lifecycleFixture();
  act(() =>
    f.renderer.update(
      f.render({
        ...f.callbacks,
        onPresent: () => {
          f.events.push('present');
          navigation.dismiss();
        },
        onDismiss: () => {
          f.events.push('dismiss');
          navigation.present('preview', { label: 'next' });
        },
      })
    )
  );
  act(() => navigation.present('form'));
  const oldSheet = sheet(f.renderer).props;
  act(() => oldSheet.onSettle(1));
  expect(f.events).toEqual(['willPresent', 'present', 'willDismiss']);
  act(() => oldSheet.onSettle(0));
  expect(f.events).toEqual([
    'willPresent',
    'present',
    'willDismiss',
    'dismiss',
    'willPresent',
  ]);
  const removedSheet = sheet(f.renderer).props;
  act(() => f.renderer.unmount());
  act(() => {
    removedSheet.onSettle(1);
    removedSheet.onIndexChange(0);
    removedSheet.onSettle(0);
  });
  expect(f.events).toHaveLength(5);
});

function pendingPushFixture(
  guard: 'ref' | 'library',
  origin: 'hook' | 'prop' = 'hook'
) {
  type TradeRoutes = {
    Position: undefined;
    Add: { amount: number } | undefined;
    CashOut: undefined;
  };
  const Trade = createTray<TradeRoutes>();
  const captures: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }> = [];
  const capture = jest
    .spyOn(TransitionCoordinator.prototype, 'captureSourceGroup')
    .mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          captures.push({ resolve, reject });
        })
    );
  let tray!: TrayNavigation<TradeRoutes>;
  let state!: TrayState<TradeRoutes>;
  let push!: (name: 'Add' | 'CashOut') => void | boolean;
  const focuses = jest.fn();
  const dismissed = jest.fn();
  function Position({
    tray: propTray,
  }: TrayScreenProps<TradeRoutes, 'Position'>) {
    const hookTray = Trade.useTray();
    const sourceTray = origin === 'hook' ? hookTray : propTray;
    const active = Trade.useTrayState((s) => s.route?.name === 'Position');
    const pushing = useRef(false);
    useEffect(() => {
      if (active) pushing.current = false;
    }, [active]);
    Trade.useFocusEffect(focuses);
    push = (name) => {
      if (guard === 'library')
        return sourceTray.push(name, undefined, {
          groupId: 'props-trade-chart',
        });
      if (!active || pushing.current) return false;
      pushing.current = true;
      sourceTray.push(name, undefined, { groupId: 'props-trade-chart' });
      return true;
    };
    return <Text>Position</Text>;
  }
  function Editor({ route }: TrayScreenProps<TradeRoutes>) {
    return <Text>{route.name}</Text>;
  }
  function Observe() {
    tray = Trade.useTray();
    state = Trade.useTrayState((s) => s);
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Trade.Provider>
        <Observe />
        <Trade.Stack onDismiss={dismissed}>
          <Trade.Screen name="Position" component={Position} />
          <Trade.Screen name="Add" component={Editor} />
          <Trade.Screen name="CashOut" component={Editor} />
        </Trade.Stack>
      </Trade.Provider>
    );
  });
  act(() => tray.present('Position'));
  act(() => sheet(renderer).props.onSettle(1));
  return {
    renderer,
    tray,
    captures,
    focuses,
    dismissed,
    push: (name: 'Add' | 'CashOut') => push(name),
    state: () => state,
    dispose: () => {
      act(() => renderer.unmount());
      capture.mockRestore();
    },
  };
}

test('a consumer focus-reset ref stays locked when preparation is cancelled without a route change', async () => {
  const f = pendingPushFixture('ref');
  try {
    const initial = f.state();
    act(() => expect(f.push('Add')).toBe(true));
    expect(f.captures).toHaveLength(1);
    act(() => sheet(f.renderer).props.onIndexChange(0));
    act(() => sheet(f.renderer).props.onIndexChange(1));
    await act(async () => f.captures[0]!.resolve());
    expect(f.state()).toBe(initial);
    expect(f.focuses).toHaveBeenCalledTimes(1);
    expect(f.dismissed).not.toHaveBeenCalled();
    expect(
      f.renderer.root
        .findAllByType(Text)
        .some((t) => t.props.children === 'Add')
    ).toBe(false);
    act(() => expect(f.push('CashOut')).toBe(false));
    expect(f.captures).toHaveLength(1);
  } finally {
    f.dispose();
  }
});

test.each([
  ['Add', 'hook'],
  ['CashOut', 'hook'],
  ['Add', 'prop'],
  ['CashOut', 'prop'],
] as const)(
  'push ignores rapid Add/%s taps from the %s and recovers without refocusing',
  async (second, origin) => {
    const f = pendingPushFixture('library', origin);
    try {
      const initial = f.state();
      act(() => {
        f.push('Add');
        f.push(second);
      });
      expect(f.captures).toHaveLength(1);
      act(() => sheet(f.renderer).props.onIndexChange(0));
      act(() => {
        f.push(second);
      });
      act(() => sheet(f.renderer).props.onIndexChange(1));
      expect(f.state()).toBe(initial);
      expect(f.focuses).toHaveBeenCalledTimes(1);
      expect(f.dismissed).not.toHaveBeenCalled();
      act(() => {
        f.push(second);
      });
      expect(f.captures).toHaveLength(2);
      // Completing the obsolete capture cannot commit or unlock this attempt.
      await act(async () => f.captures[0]!.resolve());
      expect(f.state()).toBe(initial);
      act(() => {
        f.push('Add');
      });
      await act(async () => f.captures[1]!.resolve());
      expect(f.state().route?.name).toBe(second);
      expect(f.state().depth).toBe(2);
      act(() => {
        f.push('Add');
      });
      expect(f.captures).toHaveLength(2);
      expect(f.state().depth).toBe(2);
    } finally {
      f.dispose();
    }
  }
);

test('capture rejection and missing endpoints fall back, settle, and allow navigation again', async () => {
  const f = pendingPushFixture('library');
  try {
    const root = f.state().route!.key;
    act(() => {
      f.push('Add');
    });
    await act(async () =>
      f.captures[0]!.reject(new Error('Capture unavailable'))
    );
    expect(f.state().route?.name).toBe('Add');
    // No shared elements are registered in this fixture. Layout releases the
    // real coordinator's missing-endpoint fallback into the page crossfade.
    await act(async () => {
      for (const view of sheet(f.renderer).findAllByType(View)) {
        view.props.onLayout?.({ nativeEvent: { layout: { height: 200 } } });
      }
    });
    act(() => mockCompletions.shift()!(true));
    const editor = f.state();
    act(() => {
      f.push('CashOut');
    });
    expect(f.state()).toBe(editor);
    expect(f.captures).toHaveLength(1);
    act(() => f.tray.back());
    await act(async () => f.captures[1]!.resolve());
    await act(async () => {});
    act(() => {
      f.push('CashOut');
    });
    act(() => mockCompletions.shift()!(true));
    expect(f.state().route?.key).toBe(root);
    act(() => {
      f.push('CashOut');
    });
    const oldSettle = sheet(f.renderer).props.onSettle;
    act(() => f.tray.dismiss());
    act(() => {
      f.push('Add');
    });
    act(() => oldSettle(0));
    expect(f.state().isPresented).toBe(false);
    act(() => f.tray.present('Position'));
    act(() => sheet(f.renderer).props.onSettle(1));
    act(() => oldSettle(0));
    await act(async () => f.captures[2]!.resolve());
    act(() => {
      f.push('Add');
    });
    expect(f.captures).toHaveLength(4);
  } finally {
    f.dispose();
  }
});

test.each([
  'screen prop',
  'screen hook',
  'header prop',
  'header hook',
] as const)(
  '%s pushes remain bound to their owner through Back and close/reopen',
  (origin) => {
    const callbacks = new Map<string, () => void>();
    function Record({ route, tray }: TrayScreenProps<Routes>) {
      const fromHook = Tray.useTray();
      expect(fromHook).toBe(tray);
      const source = origin.endsWith('hook') ? fromHook : tray;
      callbacks.set(route.key, () => source.push('form'));
      return <Text>{route.key}</Text>;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Tray.Provider>
          <Observer />
          <Tray.Stack
            renderHeader={
              origin.startsWith('header')
                ? (props) => <Record {...props} />
                : undefined
            }
          >
            <Tray.Screen
              name="form"
              component={origin.startsWith('screen') ? Record : Form}
            />
          </Tray.Stack>
        </Tray.Provider>
      );
    });
    try {
      act(() => navigation.present('form'));
      const root = navigationState.route!;
      const push = callbacks.get(root.key)!;
      act(() => push()); // Still opening.
      expect(navigationState.depth).toBe(1);
      act(() => sheet(renderer).props.onSettle(1));
      act(() => {
        push();
        push();
      });
      expect(navigationState.depth).toBe(2);
      act(() => mockCompletions.shift()!(true));
      const editor = navigationState;
      act(() => push()); // Inactive source, even after the transition ended.
      expect(navigationState).toBe(editor);
      act(() => navigation.back());
      expect(navigationState.route).toBe(root);
      act(() => push()); // Current again, but Back still owns the transition.
      expect(navigationState.depth).toBe(1);
      act(() => mockCompletions.shift()!(true));
      act(() => push());
      expect(navigationState.depth).toBe(2);
      act(() => navigation.dismiss());
      act(() => sheet(renderer).props.onSettle(0));
      act(() => navigation.present('form'));
      act(() => sheet(renderer).props.onSettle(1));
      const reopened = navigationState;
      act(() => push()); // Removed source.
      expect(navigationState).toBe(reopened);
      act(() => callbacks.get(reopened.route!.key)!());
      expect(navigationState.depth).toBe(2);
    } finally {
      act(() => renderer.unmount());
    }
  }
);

beforeEach(() => {
  mockCompletions.length = 0;
  unmounted.length = 0;
});

function focusFixture(header = false) {
  const events: string[] = [];
  const mounted: string[] = [];
  const ValueContext = createContext('first');
  function Child({ id }: { id: string }) {
    const value = useContext(ValueContext);
    Tray.useFocusEffect(
      useCallback(() => {
        events.push(`focus ${id} ${value}`);
        return () => {
          events.push(`blur ${id} ${value}`);
        };
      }, [id, value])
    );
    return null;
  }
  function FocusScreen({ route }: TrayScreenProps<Routes>) {
    useEffect(() => {
      mounted.push(route.key);
    }, [route.key]);
    return <Child id={route.key} />;
  }
  function Header({ route }: TrayHeaderProps<Routes>) {
    return <Child id={`header:${route.key}`} />;
  }
  const render = (value = 'first') => (
    <ValueContext.Provider value={value}>
      <Tray.Provider>
        <Observer />
        <Tray.Stack
          renderHeader={header ? (props) => <Header {...props} /> : undefined}
        >
          <Tray.Screen name="form" component={FocusScreen} />
          <Tray.Screen name="preview" component={FocusScreen} />
        </Tray.Stack>
      </Tray.Provider>
    </ValueContext.Provider>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(render());
  });
  return { renderer, events, mounted, render };
}

test('focus effects follow route instances through queued Back without remounting retained screens', () => {
  const { renderer, events, mounted } = focusFixture();
  act(() => navigation.present('form'));
  const root = navigationState.route!.key;
  expect(events).toEqual([`focus ${root} first`]);
  act(() => sheet(renderer).props.onSettle(1));
  act(() => navigation.push('form'));
  const next = navigationState.route!.key;
  expect(events).toEqual([
    `focus ${root} first`,
    `blur ${root} first`,
    `focus ${next} first`,
  ]);
  act(() => navigation.back());
  expect(events).toHaveLength(3);
  const staleCompletion = mockCompletions.shift()!;
  act(() => staleCompletion(true));
  expect(events.slice(-2)).toEqual([
    `blur ${next} first`,
    `focus ${root} first`,
  ]);
  const count = events.length;
  act(() => staleCompletion(true));
  act(() => mockCompletions.shift()!(true));
  expect(events).toHaveLength(count);
  expect(mounted).toEqual([root, next]);
  act(() => renderer.unmount());
  expect(events.at(-1)).toBe(`blur ${root} first`);
});

test('focus effects restart only the focused callback when dependencies change', () => {
  const { renderer, events, render } = focusFixture();
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  const root = navigationState.route!.key;
  act(() => renderer.update(render()));
  expect(events).toEqual([`focus ${root} first`]);
  act(() => renderer.update(render('second')));
  expect(events.slice(-2)).toEqual([
    `blur ${root} first`,
    `focus ${root} second`,
  ]);
  act(() => navigation.push('preview', { label: 'Next' }));
  act(() => mockCompletions.shift()!(true));
  const next = navigationState.route!.key;
  const count = events.length;
  act(() => renderer.update(render('third')));
  expect(events.slice(count)).toEqual([
    `blur ${next} second`,
    `focus ${next} third`,
  ]);
  act(() => navigation.back());
  expect(events.slice(-2)).toEqual([
    `blur ${next} third`,
    `focus ${root} third`,
  ]);
  act(() => renderer.unmount());
});

test('focus effects follow replace, popToRoot, and present without waiting for animation completion', () => {
  const { renderer, events } = focusFixture();
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  const root = navigationState.route!.key;
  act(() => navigation.push('preview', { label: 'First' }));
  act(() => mockCompletions.shift()!(true));
  const previous = navigationState.route!.key;
  act(() => navigation.replace('preview', { label: 'Replacement' }));
  const replacement = navigationState.route!.key;
  expect(events.slice(-2)).toEqual([
    `blur ${previous} first`,
    `focus ${replacement} first`,
  ]);
  act(() => mockCompletions.shift()!(true));
  act(() => navigation.popToRoot());
  expect(events.slice(-2)).toEqual([
    `blur ${replacement} first`,
    `focus ${root} first`,
  ]);
  act(() => mockCompletions.shift()!(true));
  act(() => navigation.present('form'));
  const newRoot = navigationState.route!.key;
  expect(events.slice(-2)).toEqual([
    `blur ${root} first`,
    `focus ${newRoot} first`,
  ]);
  act(() => renderer.unmount());
  expect(events.at(-1)).toBe(`blur ${newRoot} first`);
});

test.each(['programmatic', 'native'] as const)(
  'focus cleanup waits for %s dismissal and ignores stale sheet callbacks after reopening',
  (mode) => {
    const { renderer, events } = focusFixture();
    act(() => navigation.present('form'));
    act(() => sheet(renderer).props.onSettle(1));
    const root = navigationState.route!.key;
    const settle = sheet(renderer).props.onSettle;
    if (mode === 'programmatic') act(() => navigation.dismiss());
    else act(() => sheet(renderer).props.onIndexChange(0));
    expect(events).toEqual([`focus ${root} first`]);
    act(() => navigation.present('preview', { label: 'Reopened' }));
    expect(events).toHaveLength(1);
    act(() => settle(0));
    const reopened = navigationState.route!.key;
    expect(events).toEqual([
      `focus ${root} first`,
      `blur ${root} first`,
      `focus ${reopened} first`,
    ]);
    act(() => settle(0));
    expect(events).toHaveLength(3);
    act(() => renderer.unmount());
    expect(events.at(-1)).toBe(`blur ${reopened} first`);
  }
);

test('focus follows shared navigation after source preparation, even while the target waits for layout', async () => {
  const { renderer, events } = focusFixture();
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  const root = navigationState.route!.key;
  act(() =>
    navigation.push('preview', { label: 'Shared' }, { groupId: 'avatar' })
  );
  expect(events).toEqual([`focus ${root} first`]);
  await act(async () => {});
  const target = navigationState.route!.key;
  expect(target).not.toBe(root);
  expect(events.slice(-2)).toEqual([
    `blur ${root} first`,
    `focus ${target} first`,
  ]);
  expect(mockCompletions).toHaveLength(0);
  act(() => navigation.dismiss());
  act(() => sheet(renderer).props.onSettle(0));
  expect(events.at(-1)).toBe(`blur ${target} first`);
  act(() => renderer.unmount());
});

test('custom header components receive the same focus lifecycle as their screen descendants', () => {
  const { renderer, events } = focusFixture(true);
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  const root = navigationState.route!.key;
  act(() => navigation.push('preview', { label: 'Next' }));
  const target = navigationState.route!.key;
  expect(events.filter((event) => event.includes('header:'))).toEqual([
    `focus header:${root} first`,
    `blur header:${root} first`,
    `focus header:${target} first`,
  ]);
  act(() => mockCompletions.shift()!(true));
  expect(
    events.filter((event) => event === `blur header:${root} first`)
  ).toHaveLength(1);
  act(() => navigation.back());
  expect(events.filter((event) => event.includes('header:')).slice(-2)).toEqual(
    [`blur header:${target} first`, `focus header:${root} first`]
  );
  act(() => renderer.unmount());
});

test.each(['same factory', 'different factory'] as const)(
  'keeps focus independent across nested providers from the %s',
  (kind) => {
    const Inner = kind === 'same factory' ? Tray : createTray<Routes>();
    const outerFocus = jest.fn();
    const innerEvents: string[] = [];
    let inner!: TrayNavigation<Routes>;
    function InnerObserver() {
      inner = Inner.useTray();
      return null;
    }
    function InnerScreen({ route }: TrayScreenProps<Routes>) {
      Inner.useFocusEffect(
        useCallback(() => {
          innerEvents.push(`focus ${route.key}`);
          return () => {
            innerEvents.push(`blur ${route.key}`);
          };
        }, [route.key])
      );
      return null;
    }
    function OuterScreen() {
      Tray.useFocusEffect(outerFocus);
      return (
        <Inner.Provider>
          <InnerObserver />
          <Inner.Stack>
            <Inner.Screen name="form" component={InnerScreen} />
          </Inner.Stack>
        </Inner.Provider>
      );
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <Tray.Provider>
          <Observer />
          <Tray.Stack>
            <Tray.Screen name="form" component={OuterScreen} />
          </Tray.Stack>
        </Tray.Provider>
      );
    });
    act(() => navigation.present('form'));
    act(() => sheet(renderer).props.onSettle(1));
    act(() => inner.present('form'));
    const innerSheet = renderer.root.findAllByType(
      'BottomSheet' as React.ElementType
    )[1]!;
    act(() => innerSheet.props.onSettle(1));
    expect(innerEvents).toEqual(['focus 1']);
    act(() => inner.push('form'));
    expect(innerEvents).toEqual(['focus 1', 'blur 1', 'focus 2']);
    expect(outerFocus).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
    expect(innerEvents.at(-1)).toBe('blur 2');
  }
);

test.each([
  'outside',
  'provider body',
  'other factory',
  'nested provider body',
] as const)(
  'rejects a focus effect in %s without an owning tray screen',
  (location) => {
    const effect = jest.fn();
    const Other = createTray<Routes>();
    function Invalid() {
      Tray.useFocusEffect(effect);
      return null;
    }
    function Nested() {
      return (
        <Tray.Provider>
          <Invalid />
          {stack()}
        </Tray.Provider>
      );
    }
    const tree =
      location === 'outside' ? (
        <Invalid />
      ) : location === 'other factory' ? (
        <Other.Provider>
          <OtherObserver />
          <Other.Stack>
            <Other.Screen name="form" component={Invalid} />
          </Other.Stack>
        </Other.Provider>
      ) : (
        <Tray.Provider>
          <Observer />
          {location === 'provider body' && <Invalid />}
          <Tray.Stack>
            <Tray.Screen name="form" component={Nested} />
          </Tray.Stack>
        </Tray.Provider>
      );
    let other!: TrayNavigation<Routes>;
    function OtherObserver() {
      other = Other.useTray();
      return null;
    }
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    try {
      expect(() => {
        act(() => {
          renderer = TestRenderer.create(tree);
        });
        if (location === 'other factory') act(() => other.present('form'));
        if (location === 'nested provider body')
          act(() => navigation.present('form'));
      }).toThrow(
        'useFocusEffect must be used inside a screen or custom header of its Tray.Provider.'
      );
      expect(effect).not.toHaveBeenCalled();
    } finally {
      if (renderer) act(() => renderer!.unmount());
      error.mockRestore();
    }
  }
);

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
  const screenActions = renders.mock.calls[0]![0].tray;
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
    tray: screenActions,
    actions: screenActions,
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

test('isolates custom header content from tray layout and settlement while preserving application updates', () => {
  const ValueContext = createContext('initial');
  const renders = jest.fn();
  function Header(props: TrayHeaderProps<Routes>) {
    const value = useContext(ValueContext);
    const [text, setText] = useState('header draft');
    renders({ ...props, value, text });
    return (
      <TextInput testID="header-input" value={text} onChangeText={setText} />
    );
  }
  const renderHeader = jest.fn((props: TrayHeaderProps<Routes>) => (
    <Header {...props} />
  ));
  const updatedRenderer = jest.fn((props: TrayHeaderProps<Routes>) => (
    <Header {...props} title={`Custom ${props.title}`} />
  ));
  const render = (
    value = 'initial',
    title = 'Form',
    color = '#123456',
    header = renderHeader
  ) => (
    <ValueContext.Provider value={value}>
      <Tray.Provider>
        <Observer />
        <Tray.Stack renderHeader={header} textColor={color}>
          <Tray.Screen name="form" component={Form} options={{ title }} />
          <Tray.Screen name="preview" component={Preview} />
        </Tray.Stack>
      </Tray.Provider>
    </ValueContext.Provider>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(render());
  });
  act(() => navigation.present('form'));
  const rootKey = navigationState.route!.key;
  act(() => sheet(renderer).props.onSettle(1));
  const layout = (node: TestRenderer.ReactTestInstance, height: number) =>
    act(() => node.props.onLayout({ nativeEvent: { layout: { height } } }));
  layout(headerFor(renderer.root.findByType(Header)), 90);
  layout(pageFor(renderer, Form), 200);
  layout(
    sheet(renderer)
      .findAllByType(View)
      .find((node) => node.props.onLayout)!,
    290
  );
  act(() =>
    mockKeyboardHandlers.onEnd!({
      height: 200,
      progress: 1,
      duration: 250,
      target: 1,
    })
  );
  act(() =>
    mockKeyboardHandlers.onEnd!({
      height: 0,
      progress: 0,
      duration: 250,
      target: 1,
    })
  );
  expect(renders).toHaveBeenCalledTimes(1);
  expect(renderHeader).toHaveBeenCalledTimes(1);
  act(() => renderer.update(render()));
  expect(renders).toHaveBeenCalledTimes(1);
  act(() => renderer.update(render('initial', 'Updated')));
  expect(renders).toHaveBeenCalledTimes(2);
  act(() => renderer.update(render('initial', 'Updated', '#abcdef')));
  expect(renders).toHaveBeenCalledTimes(3);
  act(() =>
    renderer.update(render('initial', 'Updated', '#abcdef', updatedRenderer))
  );
  expect(renders).toHaveBeenCalledTimes(4);
  act(() =>
    renderer.update(render('changed', 'Updated', '#abcdef', updatedRenderer))
  );
  expect(renders).toHaveBeenCalledTimes(5);
  act(() =>
    renderer.root
      .findByProps({ testID: 'header-input' })
      .props.onChangeText('edited')
  );
  expect(renders).toHaveBeenCalledTimes(6);
  expect(renders).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: 'Custom Updated',
      color: '#abcdef',
      value: 'changed',
      text: 'edited',
    })
  );
  expect(updatedRenderer).toHaveBeenCalledTimes(1);
  const rootRenders = () =>
    renders.mock.calls.filter(([props]) => props.route.key === rootKey).length;
  act(() => navigation.push('preview', { label: 'Next' }));
  expect(rootRenders()).toBe(6);
  const targetKey = navigationState.route!.key;
  const count = renders.mock.calls.length;
  act(() => mockCompletions.shift()!(true));
  expect(renders).toHaveBeenCalledTimes(count);
  expect(
    renders.mock.calls.filter(([props]) => props.route.key === targetKey)
  ).toHaveLength(1);
  act(() => navigation.dismiss());
  expect(renders).toHaveBeenCalledTimes(count);
  act(() => renderer.unmount());
});

test('focus consumers rerender only when their own focus changes, including deep retained screens', () => {
  const renders = jest.fn();
  const focus = jest.fn();
  function Focused({ route }: TrayScreenProps<Routes>) {
    Tray.useFocusEffect(focus);
    renders(route.key);
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Tray.Stack>
          <Tray.Screen name="form" component={Focused} />
          <Tray.Screen name="preview" component={Focused} />
        </Tray.Stack>
      </Tray.Provider>
    );
  });
  act(() => navigation.present('form'));
  const root = navigationState.route!.key;
  act(() => sheet(renderer).props.onSettle(1));
  expect(renders.mock.calls).toEqual([[root]]);
  act(() => navigation.push('preview', { label: 'First' }));
  const first = navigationState.route!.key;
  act(() => mockCompletions.shift()!(true));
  expect(renders.mock.calls.filter(([key]) => key === root)).toHaveLength(2);
  act(() => navigation.push('preview', { label: 'Second' }));
  const second = navigationState.route!.key;
  act(() => mockCompletions.shift()!(true));
  expect(renders.mock.calls.filter(([key]) => key === root)).toHaveLength(2);
  expect(renders.mock.calls.filter(([key]) => key === first)).toHaveLength(2);
  expect(renders.mock.calls.filter(([key]) => key === second)).toHaveLength(1);
  const count = renders.mock.calls.length;
  act(() =>
    mockKeyboardHandlers.onEnd!({
      height: 200,
      progress: 1,
      duration: 250,
      target: 1,
    })
  );
  expect(renders).toHaveBeenCalledTimes(count);
  act(() => navigation.popToRoot());
  act(() => mockCompletions.shift()!(true));
  expect(renders.mock.calls.filter(([key]) => key === root)).toHaveLength(3);
  expect(renders.mock.calls.filter(([key]) => key === first)).toHaveLength(2);
  expect(focus).toHaveBeenCalledTimes(4);
  act(() => renderer.unmount());
});

test('custom header state subscriptions remain live behind the memo boundary', () => {
  const renders = jest.fn();
  function Header({ route }: TrayHeaderProps<Routes>) {
    renders(
      route.key,
      Tray.useTrayState((state) => state.depth)
    );
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Tray.Stack renderHeader={(props) => <Header {...props} />}>
          <Tray.Screen name="form" component={Form} />
        </Tray.Stack>
      </Tray.Provider>
    );
  });
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  const root = navigationState.route!.key;
  expect(renders.mock.calls).toEqual([[root, 1]]);
  act(() => navigation.push('form'));
  const target = navigationState.route!.key;
  expect(renders.mock.calls.filter(([key]) => key === root)).toEqual([
    [root, 1],
    [root, 2],
  ]);
  expect(renders.mock.calls.filter(([key]) => key === target)).toEqual([
    [target, 2],
  ]);
  act(() => mockCompletions.shift()!(true));
  expect(renders).toHaveBeenCalledTimes(3);
  act(() => navigation.back());
  expect(renders.mock.calls.filter(([key]) => key === target)).toEqual([
    [target, 2],
    [target, 1],
  ]);
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

test('built-in header preserves Back and Close actions and accessibility', () => {
  const onDismiss = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Tray.Stack textColor="#123456" onDismiss={onDismiss}>
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
  expect(
    StyleSheet.flatten(button('Close tray').findByType(Text).props.style).color
  ).toBe('#123456');
  expect(button('Back in tray').props.disabled).toBe(true);
  expect(button('Back in tray').props.accessibilityElementsHidden).toBe(true);
  act(() => navigation.push('preview', { label: 'next' }));
  act(() => mockCompletions.shift()!(true));
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

function CustomHeader({
  title,
  canGoBack,
  tray,
  color,
}: TrayHeaderProps<Routes>) {
  return (
    <View>
      <Text accessibilityRole="header" style={{ color }}>
        {title}
      </Text>
      {canGoBack && <Pressable testID="header-back" onPress={tray.back} />}
      <Pressable testID="header-close" onPress={tray.dismiss} />
    </View>
  );
}

test('custom headers inherit stack defaults, override per screen, and own their navigation buttons', () => {
  const renderHeader = jest.fn((props: TrayHeaderProps<Routes>) => (
    <CustomHeader {...props} />
  ));
  const onDismiss = jest.fn();
  const render = (title = 'Draft') => (
    <Tray.Provider>
      <Observer />
      <Tray.Stack
        renderHeader={renderHeader}
        textColor="#123456"
        onDismiss={onDismiss}
      >
        <Tray.Screen name="form" component={Form} options={{ title }} />
        <Tray.Screen
          name="preview"
          component={Preview}
          options={{
            renderHeader: (props) => (
              <CustomHeader {...props} title={props.route.params.label} />
            ),
          }}
        />
      </Tray.Stack>
    </Tray.Provider>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(render());
  });
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  expect(renderHeader).toHaveBeenLastCalledWith({
    route: navigationState.route,
    tray: renderHeader.mock.calls[0]![0].tray,
    title: 'Draft',
    canGoBack: false,
    color: '#123456',
  });
  expect(renderer.root.findAllByProps({ testID: 'header-back' })).toHaveLength(
    0
  );
  act(() => renderer.root.findByType(TextInput).props.onChangeText('edited'));
  act(() => renderer.update(render('Updated')));
  expect(renderer.root.findByType(CustomHeader).props.title).toBe('Updated');
  act(() => navigation.push('preview', { label: 'Review draft' }));
  expect(
    renderer.root
      .findAllByType(CustomHeader)
      .map((header) => header.props.title)
  ).toEqual(['Updated', 'Review draft']);
  act(() => mockCompletions.shift()!(true));
  expect(renderer.root.findAllByType(CustomHeader)).toHaveLength(1);
  act(() =>
    renderer.root.findByProps({ testID: 'header-back' }).props.onPress()
  );
  act(() => mockCompletions.shift()!(true));
  expect(renderer.root.findByType(TextInput).props.value).toBe('edited');
  act(() =>
    renderer.root.findByProps({ testID: 'header-close' }).props.onPress()
  );
  expect(sheet(renderer).props.index).toBe(0);
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => sheet(renderer).props.onSettle(0));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});

test('crossfades custom and built-in headers without changing the outgoing title or Back button', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Tray.Stack>
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
        </Tray.Stack>
      </Tray.Provider>
    );
  });
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  const builtIn = renderer.root.findByType(TrayHeaderLayer);
  act(() => navigation.push('preview', { label: 'Next' }));
  expect(renderer.root.findAllByType(TrayHeaderLayer)).toHaveLength(2);
  expect(builtIn.props.active).toBe(false);
  expect(
    builtIn.findByProps({ accessibilityRole: 'header' }).props.children
  ).toBe('Draft');
  expect(
    builtIn.findByProps({ accessibilityLabel: 'Back in tray' }).props.disabled
  ).toBe(true);
  expect(renderer.root.findByType(CustomHeader).props.title).toBe('Review');
  act(() => mockCompletions.shift()!(true));
  act(() => navigation.back());
  expect(renderer.root.findAllByType(TrayHeaderLayer)).toHaveLength(2);
  expect(renderer.root.findByType(CustomHeader).props.title).toBe('Review');
  act(() => mockCompletions.shift()!(true));
  expect(renderer.root.findAllByType(CustomHeader)).toHaveLength(0);
  expect(renderer.root.findAllByType(TrayHeaderLayer)).toHaveLength(1);
  act(() => renderer.unmount());
});

test('retains one outgoing header instance until settlement, including queued Back and dismissal', () => {
  const shared = jest.spyOn(TrayChoreographyModule, 'useTraySharedTransition');
  const mounted: string[] = [];
  const released: string[] = [];
  function StatefulHeader(props: TrayHeaderProps<Routes>) {
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
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Tray.Stack renderHeader={(props) => <StatefulHeader {...props} />}>
          <Tray.Screen name="form" component={Form} />
          <Tray.Screen name="preview" component={Preview} />
        </Tray.Stack>
      </Tray.Provider>
    );
  });
  const headers = () => renderer.root.findAllByType(StatefulHeader);
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  const rootKey = navigationState.route!.key;
  const first = headers()[0]!;
  const measure = (node: TestRenderer.ReactTestInstance, height: number) =>
    act(() => node.props.onLayout({ nativeEvent: { layout: { height } } }));
  measure(headerFor(first), 90);
  measure(pageFor(renderer, Form), 200);
  act(() => first.findByType(TextInput).props.onChangeText('edited header'));
  act(() => navigation.push('preview', { label: 'Next' }));
  const nextKey = navigationState.route!.key;
  measure(headerFor(headers()[1]!), 90);
  measure(pageFor(renderer, Preview), 200);
  expect(headers()[0]).toBe(first);
  expect(first.findByType(TextInput).props.value).toBe('edited header');
  expect(mounted).toEqual([rootKey, nextKey]);
  const outgoing = renderer.root
    .findAllByType(TrayHeaderLayer)
    .find((layer) => !layer.props.active)!;
  expect(outgoing.findByType(View).props.pointerEvents).toBe('none');
  expect(outgoing.findByType(View).props.accessibilityElementsHidden).toBe(
    true
  );
  expect(released).toEqual([]);
  act(() => navigation.back());
  const staleCompletion = mockCompletions.shift()!;
  act(() => staleCompletion(true));
  expect(navigationState.route?.key).toBe(rootKey);
  // No new native onLayout is sent when this measured header becomes active again.
  expect(shared.mock.calls.at(-1)![0].targetReady).toBe(true);
  // Queued Back reuses the still-mounted header without dropping its local state.
  expect(headers().find((header) => header.props.route.key === rootKey)).toBe(
    first
  );
  act(() => staleCompletion(true));
  expect(headers()).toHaveLength(2);
  act(() => mockCompletions.shift()!(true));
  expect(headers()).toHaveLength(1);
  expect(released).toEqual([nextKey]);
  act(() => navigation.push('preview', { label: 'Closing' }));
  act(() => navigation.dismiss());
  act(() => sheet(renderer).props.onSettle(0));
  expect(headers()).toHaveLength(0);
  expect(released).toContain(rootKey);
  act(() => mockCompletions.shift()!(true));
  expect(headers()).toHaveLength(0);
  act(() => renderer.unmount());
  shared.mockRestore();
});

test('measures custom headers independently for retained pages and ignores stale layout callbacks', () => {
  let geometry!: ReturnType<typeof useTrayGeometry>;
  function GeometryForm() {
    geometry = useTrayGeometry();
    return <Form />;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <Tray.Provider>
        <Observer />
        <Tray.Stack
          topInset={50}
          bottomInset={20}
          handleVisible={false}
          renderHeader={(props) => <CustomHeader {...props} />}
        >
          <Tray.Screen
            name="form"
            component={GeometryForm}
            options={{ presentation: 'fullScreen' }}
          />
          <Tray.Screen
            name="preview"
            component={Preview}
            options={{ presentation: 'fullScreen', handleVisible: true }}
          />
        </Tray.Stack>
      </Tray.Provider>
    );
  });
  const layout = (callback: (event: unknown) => void, height: number) =>
    act(() => callback({ nativeEvent: { layout: { height } } }));
  const measureHeader = () =>
    headerFor(
      renderer.root
        .findAllByType(CustomHeader)
        .find(
          (header) => header.props.route.key === navigationState.route?.key
        )!
    ).props.onLayout;
  const pageHeight = (component: React.ElementType) =>
    StyleSheet.flatten(pageFor(renderer, component).props.style).height;
  const windowHeight = Dimensions.get('window').height;
  act(() => navigation.present('form'));
  act(() => sheet(renderer).props.onSettle(1));
  const rootKey = navigationState.route!.key;
  const staleLayout = measureHeader();
  layout(staleLayout, 90);
  layout(pageFor(renderer, GeometryForm).props.onLayout, windowHeight - 160);
  expect(pageHeight(GeometryForm)).toBe(windowHeight - 160);
  expect(geometry.origins.get(geometry.screenId(rootKey))?.y).toBe(140);
  layout(staleLayout, NaN);
  layout(staleLayout, -1);
  layout(staleLayout, Infinity);
  expect(pageHeight(GeometryForm)).toBe(windowHeight - 160);
  act(() => navigation.push('preview', { label: 'Next' }));
  layout(measureHeader(), 120);
  expect(pageHeight(Preview)).toBe(windowHeight - 204);
  expect(pageHeight(GeometryForm)).toBe(windowHeight - 160);
  expect(geometry.origins.get(geometry.screenId(rootKey))?.y).toBe(140);
  layout(staleLayout, 300);
  expect(pageHeight(GeometryForm)).toBe(windowHeight - 160);
  act(() => mockCompletions.shift()!(true));
  act(() => navigation.back());
  layout(measureHeader(), 100);
  expect(pageHeight(GeometryForm)).toBe(windowHeight - 170);
  act(() => mockCompletions.shift()!(true));
  act(() =>
    mockKeyboardHandlers.onEnd!({
      height: 200,
      progress: 1,
      duration: 250,
      target: 1,
    })
  );
  expect(pageHeight(GeometryForm)).toBe(windowHeight - 350);
  act(() => renderer.unmount());
  layout(staleLayout, 500);
});

test('waits for fresh custom-header layout when returning from a built-in header', () => {
  const shared = jest.spyOn(TrayChoreographyModule, 'useTraySharedTransition');
  let renderer!: TestRenderer.ReactTestRenderer;
  try {
    act(() => {
      renderer = TestRenderer.create(
        <Tray.Provider>
          <Observer />
          <Tray.Stack>
            <Tray.Screen
              name="form"
              component={Form}
              options={{
                renderHeader: (props) => <CustomHeader {...props} />,
              }}
            />
            <Tray.Screen name="preview" component={Preview} />
          </Tray.Stack>
        </Tray.Provider>
      );
    });
    const ready = () => shared.mock.calls.at(-1)![0].targetReady;
    const measureHeader = () =>
      act(() =>
        headerFor(renderer.root.findByType(CustomHeader)).props.onLayout({
          nativeEvent: { layout: { height: 90 } },
        })
      );
    act(() => navigation.present('form'));
    act(() => sheet(renderer).props.onSettle(1));
    act(() =>
      pageFor(renderer, Form).props.onLayout({
        nativeEvent: { layout: { height: 200 } },
      })
    );
    expect(ready()).toBe(false);
    measureHeader();
    expect(ready()).toBe(true);
    act(() => navigation.push('preview', { label: 'Built-in header' }));
    act(() => mockCompletions.shift()!(true));
    act(() => navigation.back());
    expect(ready()).toBe(false);
    measureHeader();
    expect(ready()).toBe(true);
    act(() => mockCompletions.shift()!(true));
  } finally {
    if (renderer) act(() => renderer.unmount());
    shared.mockRestore();
  }
});

test('a null header and hidden handle leave no reserved header space', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  const render = (handleVisible: boolean, custom = true) => (
    <Tray.Provider>
      <Observer />
      <Tray.Stack
        handleVisible={handleVisible}
        renderHeader={custom ? () => null : undefined}
      >
        <Tray.Screen
          name="form"
          component={Form}
          options={{ presentation: 'fullScreen' }}
        />
      </Tray.Stack>
    </Tray.Provider>
  );
  act(() => {
    renderer = TestRenderer.create(render(false));
  });
  act(() => navigation.present('form'));
  const header = sheet(renderer)
    .findAllByType(View)
    .filter((view) => view.props.onLayout)[1]!;
  act(() => header.props.onLayout({ nativeEvent: { layout: { height: 0 } } }));
  const pageHeight = () =>
    StyleSheet.flatten(pageFor(renderer, Form).props.style).height;
  const windowHeight = Dimensions.get('window').height;
  expect(pageHeight()).toBe(windowHeight);
  act(() => renderer.update(render(true)));
  expect(pageHeight()).toBe(windowHeight - 14);
  act(() => renderer.update(render(false, false)));
  expect(pageHeight()).toBe(windowHeight - 56);
  act(() => renderer.update(render(true, false)));
  expect(pageHeight()).toBe(windowHeight - 70);
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
    act(() => {
      if (phase === 'queued') navigation.replace('preview', { label: phase });
      else navigation.push('preview', { label: phase });
    });
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

function headerFor(node: TestRenderer.ReactTestInstance) {
  let ancestor = node.parent;
  while (ancestor && typeof ancestor.props.onLayout !== 'function')
    ancestor = ancestor.parent;
  if (!ancestor) throw new Error('Header layout view not found');
  return ancestor;
}

function pageFor(
  renderer: TestRenderer.ReactTestRenderer,
  component: React.ElementType
) {
  let node = renderer.root.findByType(component).parent!;
  while (node.props.accessibilityElementsHidden === undefined)
    node = node.parent!;
  return node;
}

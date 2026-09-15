import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import {
  ChoreographyScreenBase,
  type ChoreographyScreenProps,
} from './ChoreographyScreenBase';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  useAnimatedProps: (updater: () => { pointerEvents: string }) => ({
    get pointerEvents() {
      return updater().pointerEvents;
    },
  }),
}));

const trees: ReactTestRenderer[] = [];

afterEach(async () => {
  await act(async () => {
    trees.splice(0).forEach((tree) => tree.unmount());
  });
});

function createContext() {
  return {
    activeSession: {
      id: 'reverse',
      sourceScreenId: 'detail',
      targetScreenId: 'home',
      state: 'active',
      direction: 'backward',
    },
    progress: { value: 0 },
    interactionOwner: { value: null },
  } as unknown as ChoreographyContextType;
}

async function mountScreen(
  context: ChoreographyContextType,
  screenId: string,
  actions: ChoreographyActionsType | null = null,
  screenFade?: ChoreographyScreenProps['screenFade']
) {
  let tree!: ReactTestRenderer;
  const render = (ready = true) => (
    <ChoreographyContext.Provider value={context}>
      <ChoreographyActionsContext.Provider value={actions}>
        <ChoreographyScreenBase
          screenId={screenId}
          ready={ready}
          screenFade={screenFade}
        >
          {null}
        </ChoreographyScreenBase>
      </ChoreographyActionsContext.Provider>
    </ChoreographyContext.Provider>
  );
  await act(async () => {
    tree = create(render());
  });
  trees.push(tree);
  return {
    tree,
    outer: () => tree.root.findAll((node) => Boolean(node.props.onLayout))[0]!,
    inner: () =>
      tree.root.findAll((node) => Boolean(node.props.animatedProps))[0]!,
    update: (ready: boolean) => tree.update(render(ready)),
  };
}

test.each(['pending', 'preparing'] as const)(
  'disabling screen fade preserves the forward %s visibility and input gate',
  async (phase) => {
    const context = createContext();
    context.activeSession!.direction = 'forward';
    if (phase === 'pending') {
      context.activeSession = null;
      context.pendingTargetScreenId = 'home';
    } else context.activeSession!.state = 'preparing';
    const screen = await mountScreen(context, 'home', null, false);
    expect(screen.outer().props.style).toContainEqual({ opacity: 0 });
    expect(screen.outer().props.pointerEvents).toBe('none');
  }
);

test('applies custom fade and disabled fade through the screen wrapper', async () => {
  const context = createContext();
  context.progress.value = 0.5;
  const custom = await mountScreen(context, 'detail', null, {
    during: [0.2, 0.8],
  });
  expect(custom.inner().props.style[1].opacity).toBeCloseTo(0.5);
  const disabled = await mountScreen(context, 'detail', null, false);
  expect(disabled.inner().props.style[1].opacity).toBe(1);
  expect(disabled.inner().props.animatedProps.pointerEvents).toBe('none');
});

test('releases only the reverse destination before React session cleanup', async () => {
  const context = createContext();
  const destination = await mountScreen(context, 'home');
  const outgoing = await mountScreen(context, 'detail');
  expect(destination.outer().props.pointerEvents).toBe('box-none');
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('none');
  expect(outgoing.inner().props.animatedProps.pointerEvents).toBe('none');

  context.interactionOwner.value = 'home';

  expect(context.activeSession?.state).toBe('active');
  expect(destination.inner().props.animatedProps.pointerEvents).toBe('auto');
  expect(outgoing.inner().props.animatedProps.pointerEvents).toBe('none');
});

test.each(['pending', 'preparing'] as const)(
  'keeps the plain outer input gate closed while %s',
  async (phase) => {
    const context = createContext();
    if (phase === 'pending') context.pendingTargetScreenId = 'home';
    else context.activeSession!.state = 'preparing';
    context.interactionOwner.value = 'home';
    const screen = await mountScreen(context, 'home');
    expect(screen.outer().props.pointerEvents).toBe('none');
  }
);

test('keeps presentation registration stable when readiness changes', async () => {
  const unregister = jest.fn();
  const registerScreenPresentation = jest.fn(() => unregister);
  const actions = {
    registerScreenPresentation,
    setScreenReady: jest.fn(),
    unregisterScreen: jest.fn(),
  } as unknown as ChoreographyActionsType;
  const screen = await mountScreen(createContext(), 'home', actions);
  expect(registerScreenPresentation).toHaveBeenCalledTimes(1);
  await act(async () => screen.update(false));
  expect(registerScreenPresentation).toHaveBeenCalledTimes(1);
  expect(unregister).not.toHaveBeenCalled();
  await act(async () => screen.tree.unmount());
  expect(unregister).toHaveBeenCalledTimes(1);
});

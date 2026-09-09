import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ChoreographyScreenBase } from './ChoreographyScreenBase';

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
  actions: ChoreographyActionsType | null = null
) {
  let tree!: ReactTestRenderer;
  const render = (ready = true) => (
    <ChoreographyContext.Provider value={context}>
      <ChoreographyActionsContext.Provider value={actions}>
        <ChoreographyScreenBase screenId={screenId} ready={ready}>
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

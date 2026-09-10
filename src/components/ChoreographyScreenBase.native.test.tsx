import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyActionsContext,
  ChoreographyContext,
  type ChoreographyActionsType,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { hasNativePreparation } from '../core/nativePreparation';
import { ChoreographyScreenBase } from './ChoreographyScreenBase';

jest.mock('../core/nativePreparation', () => ({
  hasNativePreparation: jest.fn(),
}));

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
}));

const hasNative = jest.mocked(hasNativePreparation);
const trees: ReactTestRenderer[] = [];
let frames: ((time: number) => void)[];

beforeEach(() => {
  frames = [];
  hasNative.mockReturnValue(true);
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(async () => {
  await act(async () => {
    trees.splice(0).forEach((tree) => tree.unmount());
  });
  jest.restoreAllMocks();
});

function CommitLayoutEvent({ deliver }: { deliver: () => void }) {
  useLayoutEffect(deliver, [deliver]);
  return null;
}

async function mountScreen({
  ready = true,
  layoutDuringCommit = false,
}: { ready?: boolean; layoutDuringCommit?: boolean } = {}) {
  const unregisterPresentation = jest.fn();
  const actions = {
    registerScreenPresentation: jest.fn(() => unregisterPresentation),
    setScreenReady: jest.fn(),
    unregisterScreen: jest.fn(),
  };
  const context = {
    activeSession: null,
    pendingTargetScreenId: 'detail',
    pendingSourceScreenId: 'home',
    progress: { value: 0 },
    interactionOwner: { value: null },
  } as unknown as ChoreographyContextType;
  let tree!: ReactTestRenderer;
  const outer = () =>
    tree.root.findAll((node) => Boolean(node.props?.onLayout))[0]!;
  const deliverLayout = () => outer().props.onLayout();
  const render = (isReady: boolean, screenId = 'detail') => (
    <ChoreographyContext.Provider value={context}>
      <ChoreographyActionsContext.Provider
        value={actions as unknown as ChoreographyActionsType}
      >
        <ChoreographyScreenBase screenId={screenId} ready={isReady}>
          {null}
        </ChoreographyScreenBase>
        {layoutDuringCommit && <CommitLayoutEvent deliver={deliverLayout} />}
      </ChoreographyActionsContext.Provider>
    </ChoreographyContext.Provider>
  );
  await act(async () => {
    tree = create(render(ready));
  });
  trees.push(tree);
  return {
    tree,
    actions,
    outer,
    unregisterPresentation,
    layout: () => act(async () => deliverLayout()),
    update: (isReady: boolean, screenId?: string) =>
      act(async () => tree.update(render(isReady, screenId))),
  };
}

async function nextFrame() {
  const callback = frames.shift();
  expect(callback).toBeDefined();
  await act(async () => callback!(0));
}

test('publishes layout readiness immediately only with native preparation', async () => {
  const screen = await mountScreen();
  expect(screen.actions.setScreenReady).not.toHaveBeenCalledWith(
    'detail',
    true
  );
  await screen.layout();
  expect(screen.actions.setScreenReady).toHaveBeenLastCalledWith(
    'detail',
    true
  );
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  // Layout readiness does not reveal a pending target before the overlay is ready.
  expect(screen.outer().props.style).toContainEqual({ opacity: 0 });
  expect(screen.outer().props.pointerEvents).toBe('none');
});

test('retains both legacy layout frames when native preparation is unavailable', async () => {
  hasNative.mockReturnValue(false);
  const screen = await mountScreen();
  await screen.layout();
  expect(screen.actions.setScreenReady).toHaveBeenLastCalledWith(
    'detail',
    false
  );
  await nextFrame();
  expect(screen.actions.setScreenReady).not.toHaveBeenCalledWith(
    'detail',
    true
  );
  await nextFrame();
  expect(screen.actions.setScreenReady).toHaveBeenLastCalledWith(
    'detail',
    true
  );
  expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
});

test.each([true, false])(
  'honors explicit readiness across layout and updates (native=%s)',
  async (native) => {
    hasNative.mockReturnValue(native);
    const screen = await mountScreen({ ready: false });
    await screen.layout();
    if (!native) {
      await nextFrame();
      await nextFrame();
    }
    expect(screen.actions.setScreenReady).not.toHaveBeenCalledWith(
      'detail',
      true
    );
    await screen.update(true);
    expect(screen.actions.setScreenReady).toHaveBeenLastCalledWith(
      'detail',
      true
    );
    await screen.update(false);
    expect(screen.actions.setScreenReady).toHaveBeenLastCalledWith(
      'detail',
      false
    );
    expect(screen.actions.registerScreenPresentation).toHaveBeenCalledTimes(1);
  }
);

test('a ready=false update during legacy frame waits prevents readiness', async () => {
  hasNative.mockReturnValue(false);
  const screen = await mountScreen();
  await screen.layout();
  await nextFrame();
  await screen.update(false);
  await nextFrame();
  expect(screen.actions.setScreenReady).not.toHaveBeenCalledWith(
    'detail',
    true
  );
});

test('does not overwrite a native layout event delivered before passive mount effects', async () => {
  const screen = await mountScreen({ layoutDuringCommit: true });
  expect(screen.actions.setScreenReady).toHaveBeenLastCalledWith(
    'detail',
    true
  );
  expect(screen.actions.registerScreenPresentation).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
  'unmount unregisters the screen and presentation and ignores queued frames (native=%s)',
  async (native) => {
    hasNative.mockReturnValue(native);
    const screen = await mountScreen();
    await screen.layout();
    await act(async () => screen.tree.unmount());
    expect(screen.actions.unregisterScreen).toHaveBeenCalledWith('detail');
    expect(screen.unregisterPresentation).toHaveBeenCalledTimes(1);
    screen.actions.setScreenReady.mockClear();
    while (frames.length > 0) await nextFrame();
    expect(screen.actions.setScreenReady).not.toHaveBeenCalled();
  }
);

test('does not carry layout readiness into a new screen identity', async () => {
  const screen = await mountScreen();
  await screen.layout();
  await screen.update(true, 'replacement');
  expect(screen.actions.unregisterScreen).toHaveBeenCalledWith('detail');
  expect(screen.actions.setScreenReady).not.toHaveBeenCalledWith(
    'replacement',
    true
  );
  await screen.layout();
  expect(screen.actions.setScreenReady).toHaveBeenLastCalledWith(
    'replacement',
    true
  );
});

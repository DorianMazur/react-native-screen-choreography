import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Platform } from 'react-native';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { runReverseTransition } from '../core/runReverseTransition';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { ProgressOwnership } from '../core/ProgressOwnership';
import type { TransitionSessionData } from '../types';
import { useChoreographyScreenRemoval } from './useChoreographyScreenRemoval';

jest.mock('../core/runReverseTransition', () => ({
  ...jest.requireActual('../core/runReverseTransition'),
  runReverseTransition: jest.fn(async () => {}),
}));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  cancelAnimation: jest.fn(),
}));

const lineage = {
  groupId: 'photo',
  sourceScreenId: 'list',
  sourceRouteKey: 'list-route',
  targetScreenId: 'detail',
  spring: { damping: 32, stiffness: 260 },
};
const trees: ReactTestRenderer[] = [];
const originalOS = Platform.OS;
let frames: ((timestamp: number) => void)[];

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'android';
  frames = [];
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
});
afterEach(async () => {
  await act(async () => trees.splice(0).forEach((tree) => tree.unmount()));
  jest.restoreAllMocks();
  Platform.OS = originalOS;
});

async function mountRemoval({
  hasLineage = true,
  opening = false,
  screenId = 'detail',
  staleContext = false,
}: {
  hasLineage?: boolean;
  opening?: boolean;
  screenId?: string;
  staleContext?: boolean;
} = {}) {
  const progress = { value: 0.8 } as ChoreographyContextType['progress'];
  const progressOwnership = new ProgressOwnership(
    { value: 0 } as ChoreographyContextType['progress'],
    progress
  );
  const navigationController = new NavigationSessionController();
  const session: TransitionSessionData | null = opening
    ? {
        id: 'opening',
        groupId: 'photo',
        sourceScreenId: 'list',
        targetScreenId: 'detail',
        direction: 'forward',
        state: 'active',
        pairs: [],
        progress,
      }
    : null;
  if (session) {
    progressOwnership.setSession(session.id);
    navigationController.setActiveSession(session);
    navigationController.acquireNavigationLock('list');
  }
  let finishMetrics!: () => void;
  const metrics = new Promise<void>((resolve) => (finishMetrics = resolve));
  const context = {
    activeSession: staleContext ? null : session,
    progress,
    getNavigationLineage: jest.fn(() => (hasLineage ? lineage : null)),
    progressOwnership,
    navigationController,
    reverseController: { owns: () => false },
    isOverlayPresented: () => true,
    setInteractiveScreen: jest.fn(),
    refreshActiveSessionMetrics: jest.fn(() => metrics),
    commitReverseTransition: jest.fn(async () => {}),
    startTransition: jest.fn(),
    cancelTransition: jest.fn(),
  } as unknown as ChoreographyContextType;
  let removal!: ReturnType<typeof useChoreographyScreenRemoval>;
  function Harness() {
    removal = useChoreographyScreenRemoval({ screenId });
    return null;
  }
  await act(async () => {
    trees.push(
      create(
        <ChoreographyContext.Provider value={context}>
          <Harness />
        </ChoreographyContext.Provider>
      )
    );
  });
  return {
    context,
    removal,
    session,
    finishMetrics,
    tree: trees[trees.length - 1]!,
  };
}

test('ordinary system Back from a settled detail delegates to the existing return flow', async () => {
  const { context, removal } = await mountRemoval();
  const popAction = jest.fn();
  const isRouteRemoved = jest.fn(() => false);
  expect(removal.preventRemove).toBe(true);
  expect(removal.sourceRouteKey).toBe('list-route');
  expect(removal.interceptRemoval(popAction, true, isRouteRemoved)).toBe(true);
  expect(runReverseTransition).toHaveBeenCalledTimes(1);
  expect(runReverseTransition).toHaveBeenCalledWith({
    ctx: context,
    groupId: 'photo',
    sourceScreenId: 'list',
    currentScreenId: 'detail',
    popAction,
    isRouteRemoved,
    spring: lineage.spring,
    canContinue: expect.any(Function),
  });
  expect(popAction).not.toHaveBeenCalled();
});

test('plain removals and screens without transition lineage keep ordinary navigation', async () => {
  const protectedScreen = await mountRemoval();
  expect(protectedScreen.removal.interceptRemoval(jest.fn(), false)).toBe(
    false
  );
  const plainScreen = await mountRemoval({ hasLineage: false });
  expect(plainScreen.removal.preventRemove).toBe(false);
  expect(plainScreen.removal.interceptRemoval(jest.fn())).toBe(false);
  expect(runReverseTransition).not.toHaveBeenCalled();
});

test('one system Back during opening reverses the same session through the provider', async () => {
  const { context, removal, finishMetrics } = await mountRemoval({
    opening: true,
    staleContext: true,
  });
  const forwardToken = context.progressOwnership.version;
  const popAction = jest.fn(async () => ({ removed: true, presented: false }));
  expect(removal.interceptRemoval(popAction)).toBe(true);
  expect(context.progressOwnership.isSession('opening')).toBe(true);
  expect(context.progressOwnership.isCurrent(forwardToken, 'opening')).toBe(
    false
  );
  expect(context.progress.value).toBe(0.8);
  expect(popAction).not.toHaveBeenCalled();
  expect(context.commitReverseTransition).not.toHaveBeenCalled();
  await act(async () => frames.shift()!(0));
  expect(context.refreshActiveSessionMetrics).toHaveBeenCalledWith('source');
  expect(context.commitReverseTransition).not.toHaveBeenCalled();
  await act(async () => finishMetrics());
  expect(context.commitReverseTransition).toHaveBeenCalledTimes(1);
  expect(context.commitReverseTransition).toHaveBeenCalledWith({
    sessionId: 'opening',
    token: context.progressOwnership.version,
    navigateBack: popAction,
    options: { spring: lineage.spring },
  });
  expect(popAction).not.toHaveBeenCalled();
  expect(context.startTransition).not.toHaveBeenCalled();
  expect(runReverseTransition).not.toHaveBeenCalled();
});

test.each(['frame', 'measurement', 'unmount'] as const)(
  'an opening-screen Back cannot submit stale work after %s',
  async (boundary) => {
    const { context, removal, finishMetrics, tree } = await mountRemoval({
      opening: true,
    });
    const popAction = jest.fn();
    expect(removal.interceptRemoval(popAction)).toBe(true);
    if (boundary !== 'frame') await act(async () => frames.shift()!(0));
    if (boundary === 'unmount') await act(async () => tree.unmount());
    await act(async () => {
      if (boundary !== 'unmount')
        context.progressOwnership.setSession('replacement');
      if (boundary === 'frame') frames.shift()!(0);
      else finishMetrics();
    });
    expect(context.commitReverseTransition).not.toHaveBeenCalled();
    expect(popAction).not.toHaveBeenCalled();
    expect(context.cancelTransition).not.toHaveBeenCalled();
  }
);

test.each(['list', 'other-route'])(
  'Back from %s cannot reverse the departing detail of another screen',
  async (screenId) => {
    const { context, removal } = await mountRemoval({
      opening: true,
      screenId,
    });
    const token = context.progressOwnership.version;
    expect(removal.interceptRemoval(jest.fn())).toBe(false);
    expect(context.progressOwnership.version).toBe(token);
    expect(context.commitReverseTransition).not.toHaveBeenCalled();
    expect(runReverseTransition).not.toHaveBeenCalled();
  }
);

test('iOS keeps its existing Back behavior during an opening session', async () => {
  Platform.OS = 'ios';
  const { context, removal } = await mountRemoval({ opening: true });
  const token = context.progressOwnership.version;
  expect(removal.interceptRemoval(jest.fn())).toBe(false);
  expect(context.progressOwnership.version).toBe(token);
  expect(context.commitReverseTransition).not.toHaveBeenCalled();
});

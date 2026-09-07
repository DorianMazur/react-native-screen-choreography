import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { withSpring } from 'react-native-reanimated';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../src/core/ChoreographyContext';
import { FAST_SPRING } from '../src/core/constants';
import { ProgressOwnership } from '../src/core/ProgressOwnership';
import { NavigationSessionController } from '../src/core/NavigationSessionController';
import { useChoreographyNavigator } from '../src/hooks/useChoreographyNavigation';
import { useChoreographyScreenRemoval } from '../src/hooks/useChoreographyScreenRemoval';
import { walletSetupSpring } from '../examples/shared/wallet-setup/setupTransitions';
import type { ChoreographyNavigationLineage } from '../src/types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  cancelAnimation: jest.fn(),
  withSpring: jest.fn((target) => target),
}));

const mockedWithSpring = jest.mocked(withSpring);

function createContext() {
  const progress = { value: 0 } as ChoreographyContextType['progress'];
  const progressOwnership = new ProgressOwnership(
    { value: 0 } as ChoreographyContextType['progress'],
    progress
  );
  let lineage: ChoreographyNavigationLineage | null = null;
  const context = {
    progress,
    progressOwnership,
    navigationController: new NavigationSessionController(),
    activeSession: null,
    pendingTargetScreenId: null,
    preMeasureGroup: jest.fn(async () => {}),
    setPendingTargetScreen: jest.fn(),
    waitForScreenReady: jest.fn(async () => true),
    waitForOverlayReady: jest.fn(async () => true),
    refreshActiveSessionMetrics: jest.fn(async () => {}),
    completeTransition: jest.fn(),
    cancelTransition: jest.fn(),
    setNavigationLineage: jest.fn((value) => {
      lineage = value;
    }),
    getNavigationLineage: jest.fn(() => lineage),
    startTransition: jest.fn(async (config) => {
      const session = {
        ...config,
        id: 'session',
        pairs: [],
        state: 'active',
        progress,
      };
      progressOwnership.setSession(session.id);
      return session;
    }),
  } as unknown as ChoreographyContextType;
  return context;
}

let tree: ReactTestRenderer | undefined;

async function mount(context: ChoreographyContextType, screenId: string) {
  let navigation!: ReturnType<typeof useChoreographyNavigator>;
  let removal!: ReturnType<typeof useChoreographyScreenRemoval>;
  const goBack = jest.fn();
  function Harness() {
    navigation = useChoreographyNavigator({
      currentScreenId: screenId,
      isFocused: true,
      goBack,
    });
    removal = useChoreographyScreenRemoval({ screenId });
    return null;
  }
  await act(async () => {
    tree = create(
      <ChoreographyContext.Provider value={context}>
        <Harness />
      </ChoreographyContext.Provider>
    );
  });
  return { navigation, removal, goBack };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});

afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.restoreAllMocks();
});

test('opening retains a copy of its custom spring on the resolved route instance', async () => {
  const context = createContext();
  const { navigation } = await mount(context, 'sheet-route');
  const spring = { ...walletSetupSpring };
  await act(async () => {
    await navigation.navigate({
      targetScreenId: 'WalletExisting',
      resolveTargetScreenId: async () => 'detail-route',
      dispatchNavigation: jest.fn(),
      options: { transitionConfig: { group: 'wallet-setup' }, spring },
    });
  });
  const lineage = context.getNavigationLineage('detail-route');
  expect(lineage).toMatchObject({
    sourceScreenId: 'sheet-route',
    targetScreenId: 'detail-route',
    spring: walletSetupSpring,
  });
  expect(lineage?.spring).not.toBe(spring);
  expect(mockedWithSpring).toHaveBeenCalledWith(
    1,
    spring,
    expect.any(Function)
  );
});

test.each([undefined, walletSetupSpring])(
  'native Back uses the recorded spring (%j) and pops only on completion',
  async (spring) => {
    const context = createContext();
    context.setNavigationLineage({
      groupId: 'wallet-setup',
      sourceScreenId: 'sheet-route',
      targetScreenId: 'detail-route',
      spring,
    });
    const { removal } = await mount(context, 'detail-route');
    const pop = jest.fn();
    await act(async () => {
      expect(removal.interceptRemoval(pop)).toBe(true);
    });
    expect(context.getNavigationLineage).toHaveBeenCalledWith('detail-route');
    expect(mockedWithSpring).toHaveBeenCalledWith(
      0,
      spring ?? FAST_SPRING,
      expect.any(Function)
    );
    expect(pop).not.toHaveBeenCalled();
    expect(context.completeTransition).not.toHaveBeenCalled();
    await act(async () => {
      mockedWithSpring.mock.calls[0]![2]!(true);
    });
    expect(pop).toHaveBeenCalledTimes(1);
    expect(context.completeTransition).toHaveBeenCalledWith('session');
  }
);

describe.each(['forward', 'backward'] as const)(
  '%s interruption',
  (direction) => {
    test.each([undefined, { stiffness: 250, damping: 32 }])(
      'reuses the recorded spring unless explicitly overridden (%j)',
      async (override) => {
        const context = createContext();
        context.setNavigationLineage({
          groupId: 'wallet-setup',
          sourceScreenId: 'sheet-route',
          targetScreenId: 'detail-route',
          spring: walletSetupSpring,
        });
        context.activeSession = {
          id: 'session',
          groupId: 'wallet-setup',
          sourceScreenId:
            direction === 'forward' ? 'sheet-route' : 'detail-route',
          targetScreenId:
            direction === 'forward' ? 'detail-route' : 'sheet-route',
          direction,
          pairs: [],
          progress: context.progress,
          state: 'active',
        };
        context.progressOwnership.setSession('session');
        context.progress.value = 0.6;
        const { navigation } = await mount(context, 'detail-route');
        await act(async () => navigation.goBack({ spring: override }));
        expect(mockedWithSpring).toHaveBeenCalledWith(
          0,
          override ?? walletSetupSpring,
          expect.any(Function)
        );
      }
    );
  }
);

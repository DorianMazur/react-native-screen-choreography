import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { withSpring } from 'react-native-reanimated';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { FAST_SPRING } from '../core/constants';
import { ProgressOwnership } from '../core/ProgressOwnership';
import { NavigationSessionController } from '../core/NavigationSessionController';
import { useChoreographyNavigator } from './useChoreographyNavigation';
import { useChoreographyScreenRemoval } from './useChoreographyScreenRemoval';
import type { ChoreographyNavigationLineage, SpringConfig } from '../types';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  cancelAnimation: jest.fn(),
  withSpring: jest.fn((target) => target),
}));

const mockedWithSpring = jest.mocked(withSpring);

const customSpring = {
  damping: 28,
  mass: 1,
  stiffness: 180,
  overshootClamping: true,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
} satisfies SpringConfig;

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
    reverseController: { owns: () => false },
    commitReverseTransition: jest.fn(async () => {}),
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
  const spring = { ...customSpring };
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
    spring: customSpring,
  });
  expect(lineage?.spring).not.toBe(spring);
  expect(mockedWithSpring).toHaveBeenCalledWith(
    1,
    spring,
    expect.any(Function)
  );
});

test.each([undefined, customSpring])(
  'native Back delegates the recorded spring (%j) and navigation to the provider',
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
    expect(context.commitReverseTransition).toHaveBeenCalledWith({
      sessionId: 'session',
      token: expect.any(Number),
      options: { spring: spring ?? FAST_SPRING },
      navigateBack: expect.any(Function),
    });
    expect(pop).not.toHaveBeenCalled();
    expect(context.completeTransition).not.toHaveBeenCalled();
    const request = jest.mocked(context.commitReverseTransition).mock
      .calls[0]![0];
    await act(async () => {
      await request.navigateBack();
    });
    expect(pop).toHaveBeenCalledTimes(1);
    expect(context.completeTransition).not.toHaveBeenCalled();
    expect(mockedWithSpring).not.toHaveBeenCalled();
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
          spring: customSpring,
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
        if (direction === 'forward') {
          expect(mockedWithSpring).toHaveBeenCalledWith(
            0,
            override ?? customSpring,
            expect.any(Function)
          );
        } else {
          expect(context.commitReverseTransition).toHaveBeenCalledWith({
            sessionId: 'session',
            token: expect.any(Number),
            navigateBack: expect.any(Function),
            options: { spring: override ?? customSpring, duration: undefined },
          });
          expect(mockedWithSpring).not.toHaveBeenCalled();
        }
      }
    );
  }
);

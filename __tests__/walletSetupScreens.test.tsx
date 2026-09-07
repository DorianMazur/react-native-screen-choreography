import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { cancelAnimation, withTiming } from 'react-native-reanimated';
import {
  WalletExistingScreen,
  WalletSetupScreen,
} from '../examples/shared/wallet-setup/WalletSetupScreens';
import { walletSetupSpring } from '../examples/shared/wallet-setup/setupTransitions';

const mockNavigation = {
  open: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
};

let mockReduceMotion = false;
const mockProgress = { value: 0 };
let mockTransition = {
  progress: mockProgress,
  direction: null as 'forward' | 'backward' | null,
  groupId: null as string | null,
  role: 'inactive',
  phase: 'idle',
};

jest.mock('../examples/shared/runtime', () => ({
  SharedElement: jest.requireActual('react-native').View,
  makeSurfaceTransition: jest.fn(() => ({})),
  useExampleNavigation: () => mockNavigation,
  useChoreographyProgress: () => mockTransition,
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../examples/shared/AppChrome', () => ({
  AppIcon: () => null,
  IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    const { Pressable: Button } = jest.requireActual('react-native');
    return <Button accessibilityLabel={label} onPress={onPress} />;
  },
}));

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  Easing: jest.requireActual('react-native').Easing,
  FadeIn: { duration: jest.fn() },
  SlideInDown: { duration: () => ({ easing: jest.fn() }) },
  useReducedMotion: () => mockReduceMotion,
  useSharedValue: (value: number) =>
    jest.requireActual('react').useState(() => ({ value }))[0],
  useAnimatedReaction: (
    prepare: () => unknown,
    react: (current: unknown, previous: unknown) => void
  ) => {
    const { useEffect, useRef } = jest.requireActual('react');
    const previous = useRef(null);
    useEffect(() => {
      const current = prepare();
      react(current, previous.current);
      previous.current = current;
    });
  },
  cancelAnimation: jest.fn(),
  withTiming: jest.fn((value: number) => value),
}));

let tree: ReactTestRenderer;

beforeEach(() => {
  jest.clearAllMocks();
  mockReduceMotion = false;
  mockProgress.value = 0;
  mockTransition = {
    progress: mockProgress,
    direction: null,
    groupId: null,
    role: 'inactive',
    phase: 'idle',
  };
});
afterEach(async () => {
  await act(async () => tree?.unmount());
});

async function render(Screen: typeof WalletSetupScreen) {
  await act(async () => {
    tree = create(<Screen />);
  });
}

async function press(label: string) {
  await act(async () => {
    tree.root
      .findAllByProps({ accessibilityLabel: label })
      .find((button) => typeof button.props.onPress === 'function')!
      .props.onPress();
  });
}

test('opens directly on the new-wallet sheet without the overview', async () => {
  await render(WalletSetupScreen);
  const text = tree.root.findAllByType(Text).map((node) => node.props.children);
  expect(text).toEqual(
    expect.arrayContaining([
      'New wallet',
      'Create new',
      'Add existing',
      'Watch a wallet',
    ])
  );
  expect(text).not.toEqual(expect.arrayContaining(['Your wallets']));
  expect(text).not.toEqual(expect.arrayContaining(['Watching']));
  expect(mockNavigation.open).not.toHaveBeenCalled();
  expect(mockNavigation.navigate).not.toHaveBeenCalled();
});

test('expands directly from the entry sheet with its existing spring', async () => {
  await render(WalletSetupScreen);
  await press('Add existing');
  expect(mockNavigation.navigate).toHaveBeenCalledWith(
    { screen: 'WalletExisting' },
    { transitionConfig: { group: 'wallet-setup' }, spring: walletSetupSpring }
  );
});

test.each(['Close new wallet', 'Dismiss new wallet'])(
  '%s leaves the example with a single Back action',
  async (label) => {
    await render(WalletSetupScreen);
    await press(label);
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  }
);

test('the expanded screen goes back to the entry sheet', async () => {
  await render(WalletExistingScreen);
  await press('Back to new wallet');
  expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
});

async function updateTransition(
  transition: Partial<typeof mockTransition>,
  progress: number
) {
  mockTransition = { ...mockTransition, ...transition };
  mockProgress.value = progress;
  await act(async () => tree.update(<WalletExistingScreen />));
}

async function finishTransition(progress = 1) {
  await updateTransition(
    { direction: null, groupId: null, role: 'inactive', phase: 'idle' },
    progress
  );
}

describe('wallet artwork finishing motion', () => {
  beforeEach(() => {
    mockTransition = {
      ...mockTransition,
      direction: 'forward',
      groupId: 'wallet-setup',
      role: 'target',
      phase: 'active',
    };
  });

  test('wiggles at the end of expansion without restarting at handoff', async () => {
    await render(WalletExistingScreen);
    await updateTransition({}, 0.84);
    expect(withTiming).not.toHaveBeenCalled();
    await updateTransition({}, 0.85);
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(withTiming).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ duration: 520 })
    );
    jest.mocked(cancelAnimation).mockClear();
    await updateTransition({}, 0.99);
    await finishTransition();
    await finishTransition();
    expect(withTiming).toHaveBeenCalledTimes(1);
    expect(cancelAnimation).not.toHaveBeenCalled();
  });

  test('does not start while the forward transition is preparing', async () => {
    mockTransition.phase = 'preparing';
    mockProgress.value = 1;
    await render(WalletExistingScreen);
    expect(withTiming).not.toHaveBeenCalled();
  });

  test('does not wiggle on Back or its cancellation', async () => {
    mockTransition.direction = 'backward';
    mockTransition.role = 'source';
    await render(WalletExistingScreen);
    await updateTransition({}, 0.9);
    await finishTransition();
    expect(withTiming).not.toHaveBeenCalled();
  });

  test('does not wiggle when forward is interrupted and returns to the sheet', async () => {
    await render(WalletExistingScreen);
    await finishTransition(0);
    expect(withTiming).not.toHaveBeenCalled();
  });

  test('cancels the finishing motion when Back begins', async () => {
    await render(WalletExistingScreen);
    await updateTransition({}, 0.85);
    jest.mocked(cancelAnimation).mockClear();
    await updateTransition(
      { direction: 'backward', role: 'source', phase: 'preparing' },
      1
    );
    expect(cancelAnimation).toHaveBeenCalled();
    expect(withTiming).toHaveBeenCalledTimes(1);
  });

  test('respects reduced motion', async () => {
    mockReduceMotion = true;
    await render(WalletExistingScreen);
    await updateTransition({}, 0.85);
    await finishTransition();
    expect(withTiming).not.toHaveBeenCalled();
  });

  test('does not wiggle on direct entry without a forward transition', async () => {
    mockTransition.direction = null;
    mockTransition.phase = 'idle';
    mockTransition.role = 'inactive';
    mockProgress.value = 1;
    await render(WalletExistingScreen);
    expect(withTiming).not.toHaveBeenCalled();
  });
});

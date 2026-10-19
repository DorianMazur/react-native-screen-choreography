import { StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { JournalDetailScreen } from '../examples/shared/journal/JournalScreens';

const mockPresentation = {
  presentationProgress: { value: 0 },
  frame: {
    value: { width: 72, height: 72 } as {
      width: number;
      height: number;
    } | null,
  },
  collapsed: { metrics: { pageX: 48, pageY: 320, width: 72, height: 72 } },
  expanded: { metrics: { pageX: 0, pageY: 24, width: 402, height: 850 } },
};

jest.mock('../examples/shared/runtime', () => ({
  useSharedElementPresentation: () => mockPresentation,
  useChoreographyControls: () => ({ settleTransition: jest.fn() }),
  useExampleNavigation: () => ({ goBack: jest.fn() }),
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../examples/shared/usePullToDismiss', () => ({
  usePullToDismiss: () => ({}),
}));

jest.mock('../examples/shared/journal/journalTransition', () => ({
  journalTransition: {
    Element: {
      Target: ({ children }: { children: React.ReactNode }) => children,
    },
  },
}));

let tree: ReactTestRenderer;

async function render() {
  await act(async () => {
    const screen = <JournalDetailScreen collectionId="trails" />;
    if (tree) tree.update(screen);
    else tree = create(screen);
  });
}

function cardStyle() {
  const card = tree.root
    .findAllByType(Animated.View)
    .find(
      (node) => StyleSheet.flatten(node.props.style)?.overflow === 'hidden'
    );
  return StyleSheet.flatten(card!.props.style);
}

function count() {
  return tree.root
    .findAllByType(Text)
    .find((node) => node.props.accessibilityLiveRegion === 'polite')?.props
    .children;
}

afterEach(async () => {
  await act(async () => tree?.unmount());
});

test('live content exists before opening, uses the same mask in both directions, and survives cancellation', async () => {
  await render();
  expect(count()).toBe(0);
  expect(cardStyle().opacity).toBe(0);

  mockPresentation.presentationProgress.value = 0.42;
  await render();
  expect(count()).toBe(0);
  const openingStyle = cardStyle();
  expect(openingStyle.opacity).toBe(1);

  // The library ends frame participation while preserving live content.
  mockPresentation.presentationProgress.value = 1;
  mockPresentation.frame.value = null;
  await render();
  expect(cardStyle().opacity).toBe(1);
  expect(count()).toBe(0);

  const add = tree.root.find(
    (node) =>
      node.props.accessibilityLabel === 'Log an observation' &&
      typeof node.props.onPress === 'function'
  );
  await act(async () => add.props.onPress());
  expect(count()).toBe(1);

  mockPresentation.frame.value = { width: 210, height: 210 };
  mockPresentation.presentationProgress.value = 0.42;
  await render();
  expect(cardStyle()).toEqual(openingStyle);
  expect(count()).toBe(1);

  mockPresentation.frame.value = null;
  mockPresentation.presentationProgress.value = 1;
  await render();
  expect(cardStyle().opacity).toBe(1);
  expect(count()).toBe(1);
});

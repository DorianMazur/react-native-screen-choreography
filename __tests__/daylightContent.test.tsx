import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import {
  act,
  fireEvent,
  render as renderComponent,
  type RenderResult,
} from '@testing-library/react-native/pure';
import { DaylightDetailScreen } from '../examples/shared/daylight/DaylightScreens';

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

jest.mock('../examples/shared/daylight/daylightTransition', () => ({
  daylightTransition: {
    Element: {
      Target: ({ children }: { children: React.ReactNode }) => children,
    },
  },
}));

let tree: RenderResult;

async function render() {
  const screen = <DaylightDetailScreen collectionId="monument-valley" />;
  if (tree) tree.rerender(screen);
  else tree = renderComponent(screen);
}

function cardStyle() {
  const card = tree.UNSAFE_root.findAllByType(Animated.View).find(
    (node) => StyleSheet.flatten(node.props.style)?.overflow === 'hidden'
  );
  return StyleSheet.flatten(card!.props.style);
}

afterEach(async () => {
  await act(async () => tree?.unmount());
});

test('live content exists before opening, uses the same mask in both directions, and survives cancellation', async () => {
  await render();
  expect(
    tree.getByLabelText('Monument Valley, Golden hour at 8:07 PM MDT')
  ).toBeTruthy();
  expect(cardStyle().opacity).toBe(0);

  mockPresentation.presentationProgress.value = 0.42;
  await render();
  expect(
    tree.getByLabelText('Monument Valley, Golden hour at 8:07 PM MDT')
  ).toBeTruthy();
  const openingStyle = cardStyle();
  expect(openingStyle.opacity).toBe(1);

  // The library ends frame participation while preserving live content.
  mockPresentation.presentationProgress.value = 1;
  mockPresentation.frame.value = null;
  await render();
  expect(cardStyle().opacity).toBe(1);
  expect(
    tree.getByLabelText('Monument Valley, Golden hour at 8:07 PM MDT')
  ).toBeTruthy();

  fireEvent.press(tree.getByRole('radio', { name: 'Solar noon, 1:22 PM' }));
  expect(
    tree.getByLabelText('Monument Valley, Solar noon at 1:22 PM MDT')
  ).toBeTruthy();

  mockPresentation.frame.value = { width: 210, height: 210 };
  mockPresentation.presentationProgress.value = 0.42;
  await render();
  expect(cardStyle()).toEqual(openingStyle);
  expect(
    tree.getByLabelText('Monument Valley, Solar noon at 1:22 PM MDT')
  ).toBeTruthy();

  mockPresentation.frame.value = null;
  mockPresentation.presentationProgress.value = 1;
  await render();
  expect(cardStyle().opacity).toBe(1);
  expect(
    tree.getByLabelText('Monument Valley, Solar noon at 1:22 PM MDT')
  ).toBeTruthy();
});

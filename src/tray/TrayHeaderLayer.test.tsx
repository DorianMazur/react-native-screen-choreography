import { StyleSheet, View } from 'react-native';
import Animated, {
  makeMutable,
  useAnimatedReaction,
} from 'react-native-reanimated';
import TestRenderer, { act } from 'react-test-renderer';
import { TrayHeaderLayer } from './TrayHeaderLayer';

beforeEach(() => jest.clearAllMocks());

test('crossfades both live headers from the supplied timeline with one input owner', () => {
  const progress = makeMutable(0);
  const render = () => (
    <>
      <TrayHeaderLayer
        active={false}
        width={300}
        progress={progress}
        session={1}
        transitionId={2}
      >
        Outgoing
      </TrayHeaderLayer>
      <TrayHeaderLayer
        active
        width={320}
        progress={progress}
        session={1}
        transitionId={2}
      >
        Incoming
      </TrayHeaderLayer>
    </>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(render());
  });
  const layers = () => renderer.root.findAllByType(TrayHeaderLayer);
  const opacity = () =>
    layers().map(
      (layer) =>
        StyleSheet.flatten(layer.findByType(Animated.View).props.style).opacity
    );
  expect(opacity()).toEqual([1, 0]);
  const [prepare, acknowledge] = jest
    .mocked(useAnimatedReaction)
    .mock.calls.at(-1)!;
  act(() => acknowledge(prepare(), null));
  for (const value of [0.25, 0.5, 1, 1.2, -0.1]) {
    progress.value = value;
    act(() => renderer.update(render()));
    const clamped = Math.max(0, Math.min(1, value));
    expect(opacity()).toEqual([1 - clamped, clamped]);
  }
  const [outgoing, incoming] = layers().map((layer) => layer.findByType(View));
  expect(StyleSheet.flatten(outgoing!.props.style)).toMatchObject({
    position: 'absolute',
    width: 300,
  });
  expect(outgoing!.props.pointerEvents).toBe('none');
  expect(outgoing!.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(incoming!.props.pointerEvents).toBe('auto');
  expect(incoming!.props.accessibilityElementsHidden).toBe(false);
  act(() => renderer.unmount());
});

test('gates the first animated frame and rejects stale acknowledgements after replacement or unmount', () => {
  const progress = makeMutable(0);
  const render = (session: number, id?: number) => (
    <TrayHeaderLayer
      active
      width={300}
      progress={progress}
      session={session}
      transitionId={id}
    >
      Header
    </TrayHeaderLayer>
  );
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(render(1, 2));
  });
  const hidden = () =>
    StyleSheet.flatten(renderer.root.findByType(View).props.style).opacity ===
    0;
  const reaction = () => {
    const [prepare, acknowledge] = jest
      .mocked(useAnimatedReaction)
      .mock.calls.at(-1)!;
    const request = prepare();
    return () => acknowledge(request, null);
  };
  const stale = reaction();
  expect(hidden()).toBe(true);
  act(() => renderer.update(render(2, 2)));
  act(stale);
  expect(hidden()).toBe(true);
  act(reaction());
  expect(hidden()).toBe(false);
  act(() => renderer.update(render(2, 3)));
  const afterUnmount = reaction();
  act(stale);
  expect(hidden()).toBe(true);
  act(() => renderer.update(render(2)));
  expect(hidden()).toBe(false);
  act(() => renderer.unmount());
  act(afterUnmount);
});

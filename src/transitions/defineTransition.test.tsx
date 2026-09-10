import { StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type {
  Transition,
  SharedElementTransitionRendererProps,
} from '../types';
import { defineTransition } from './defineTransition';
import { makeTransition } from './makeTransition';

const mockProgress = { value: 0 } as SharedValue<number>;
let mockPhase = 'active';
let mockDirection = 'forward';
let mockReducedMotion = false;
jest.mock('../hooks/useChoreographyProgress', () => ({
  useChoreographyProgress: () => ({
    progress: mockProgress,
    phase: mockPhase,
    direction: mockDirection,
  }),
}));
jest.mock('../components/SharedElement', () => ({
  SharedElement: Object.assign(
    (props: object) => {
      const React = require('react');
      return React.createElement('Owner', props);
    },
    { Target: 'Target' }
  ),
}));
jest.mock('react-native-teleport', () => ({ PortalHost: 'PortalHost' }));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  useReducedMotion: () => mockReducedMotion,
  useDerivedValue: (fn: () => unknown) => ({
    get value() {
      return fn();
    },
  }),
  interpolateColor: (_value: number, _input: number[], output: string[]) =>
    output[0],
}));

const trees: ReactTestRenderer[] = [];
async function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  trees.push(tree);
  return tree;
}
afterEach(async () => {
  await act(async () => trees.splice(0).forEach((tree) => tree.unmount()));
  mockProgress.value = 0;
  mockPhase = 'active';
  mockDirection = 'forward';
  mockReducedMotion = false;
});

test('owner and empty target bind the same named transition', async () => {
  const definition = defineTransition({
    shared: { hero: { kind: 'bounds', zIndex: 0 } },
  });
  const tree = await mount(
    <>
      <definition.Element
        name="hero"
        groupId="photo"
        metadata={{ size: 'small' }}
      >
        Only content
      </definition.Element>
      <definition.Element.Target
        name="hero"
        groupId="photo"
        style={{ width: 300, height: 300 }}
      />
    </>
  );
  const owner = tree.root.findByType('Owner' as React.ElementType);
  const target = tree.root.findByType('Target' as React.ElementType);
  expect(owner.props.id).toBe('hero');
  expect(owner.props.groupId).toBe('photo');
  expect(owner.props.transition).toBe(target.props.transition);
  expect(owner.props.transition.zIndex).toBe(0);
  expect(target.props.children).toBeUndefined();
  const transition = owner.props.transition;
  await act(async () =>
    tree.update(
      <definition.Element name="hero" groupId="photo">
        Updated
      </definition.Element>
    )
  );
  expect(
    tree.root.findByType('Owner' as React.ElementType).props.transition
  ).toBe(transition);
});

test.each(['bounds', 'surface'] as const)(
  '%s has one retained host and reverses the same geometry',
  async (kind) => {
    const definition = defineTransition({
      shared: { hero: { kind, radius: [8, 0] } },
    });
    const owner = await mount(
      <definition.Element name="hero" groupId="photo">
        Content
      </definition.Element>
    );
    const transition: Transition = owner.root.findByType(
      'Owner' as React.ElementType
    ).props.transition;
    const small = {
      screenId: 'list',
      metrics: { pageX: 10, pageY: 100, width: 80, height: 100 },
    };
    const big = {
      screenId: 'detail',
      metrics: { pageX: 0, pageY: 0, width: 300, height: 400 },
    };
    const Renderer = transition.renderer;
    const render = (direction: 'forward' | 'backward') => {
      const props: SharedElementTransitionRendererProps = {
        id: 'hero',
        groupId: 'photo',
        progress: mockProgress,
        direction,
        zIndex: 0,
        source: direction === 'forward' ? small : big,
        target: direction === 'forward' ? big : small,
      };
      return <Renderer {...props} />;
    };
    mockProgress.value = 0.5;
    const tree = await mount(render('forward'));
    const host = tree.root.findByType('PortalHost' as React.ElementType);
    const frame = () =>
      StyleSheet.flatten(
        tree.root.findAllByType('Animated.View' as React.ElementType)[0]!.props
          .style
      );
    expect(frame()).toMatchObject({
      left: 5,
      top: 50,
      width: 190,
      height: 250,
    });
    await act(async () => tree.update(render('backward')));
    expect(
      tree.root.findAllByType('PortalHost' as React.ElementType)
    ).toHaveLength(1);
    expect(tree.root.findByType('PortalHost' as React.ElementType)).toBe(host);
    expect(frame()).toMatchObject({
      left: 5,
      top: 50,
      width: 190,
      height: 250,
    });
    mockProgress.value = 0;
    await act(async () => tree.update(render('backward')));
    expect(frame()).toMatchObject({
      left: 10,
      top: 100,
      width: 80,
      height: 100,
    });
  }
);

test('enter and exit are reversible local motion with no shared registration', async () => {
  const definition = defineTransition({
    enter: { notes: { during: [0.2, 0.8], translateY: 12 } },
    exit: { header: { during: [0.2, 0.8], translateY: -6 } },
  });
  const render = () => (
    <>
      <definition.Enter name="notes">Notes</definition.Enter>
      <definition.Exit name="header">Header</definition.Exit>
    </>
  );
  const tree = await mount(render());
  for (const progress of [0, 0.5, 1, 0.5, 0]) {
    mockProgress.value = progress;
    await act(async () => tree.update(render()));
    const [enter, exit] = tree.root
      .findAllByType('Animated.View' as React.ElementType)
      .map((node) => StyleSheet.flatten(node.props.style));
    const amount = Math.max(0, Math.min(1, (progress - 0.2) / 0.6));
    expect(enter.opacity).toBeCloseTo(amount);
    expect(exit.opacity).toBeCloseTo(1 - amount);
    expect(enter.transform[0].translateY).toBeCloseTo((1 - amount) * 12);
    expect(exit.transform[0].translateY).toBeCloseTo(amount * -6);
    expect(tree.root.findAllByType('Owner' as React.ElementType)).toHaveLength(
      0
    );
  }
  mockPhase = 'idle';
  await act(async () => tree.update(render()));
  for (const node of tree.root.findAllByType(
    'Animated.View' as React.ElementType
  )) {
    const style = StyleSheet.flatten(node.props.style);
    expect(style.opacity).toBe(1);
    expect(style.transform[0].translateY).toBeCloseTo(0);
  }
});

test('configuration is captured and custom live renderers remain usable', async () => {
  const recipe = {
    kind: 'bounds' as const,
    radius: [8, 0] as [number, number],
  };
  const spring = { stiffness: 240 };
  const custom = makeTransition({ renderer: () => null });
  const definition = defineTransition({
    motion: { spring },
    shared: { hero: recipe, custom },
  });
  spring.stiffness = 999;
  recipe.radius[0] = 40;
  expect(definition.navigationOptions.spring?.stiffness).toBe(240);
  const tree = await mount(
    <definition.Element name="custom">Content</definition.Element>
  );
  expect(
    tree.root.findByType('Owner' as React.ElementType).props.transition
  ).toBe(custom);
});

test('rejects invalid definitions early', () => {
  expect(() => defineTransition({})).toThrow('at least one');
  expect(() =>
    defineTransition({ shared: { ' ': { kind: 'bounds' } } })
  ).toThrow('empty');
  expect(() =>
    defineTransition({ shared: { hero: { kind: 'surface', radius: [-1, 2] } } })
  ).toThrow('radii');
  expect(() =>
    defineTransition({ enter: { notes: { during: [0.8, 0.2] } } })
  ).toThrow('intervals');
  expect(() =>
    defineTransition({ exit: { notes: { translateY: NaN } } })
  ).toThrow('finite');
  expect(() =>
    defineTransition({
      motion: { duration: 0 },
      shared: { hero: { kind: 'bounds' } },
    })
  ).toThrow('duration');
});

test('role names and empty targets are checked by TypeScript', () => {
  const definition = defineTransition({
    shared: { hero: { kind: 'bounds' } },
    enter: { notes: {} },
  });
  const invalidSharedName = () => (
    // @ts-expect-error enter roles are not shared roles
    <definition.Element name="notes">Content</definition.Element>
  );
  const invalidTargetName = () => (
    // @ts-expect-error targets use the same shared role names as owners
    <definition.Element.Target name="unknown" />
  );
  const invalidTargetChildren = () => (
    // @ts-expect-error live targets cannot own duplicate content
    <definition.Element.Target name="hero">Duplicate</definition.Element.Target>
  );
  expect([
    invalidSharedName,
    invalidTargetName,
    invalidTargetChildren,
  ]).toHaveLength(3);
});

test.each(['forward', 'backward'] as const)(
  'preparing %s ignores progress left by an earlier session',
  async (direction) => {
    mockPhase = 'preparing';
    mockDirection = direction;
    mockProgress.value = direction === 'forward' ? 1 : 0;
    const definition = defineTransition({
      enter: { notes: {} },
      exit: { heading: {} },
    });
    const tree = await mount(
      <>
        <definition.Enter name="notes">Notes</definition.Enter>
        <definition.Exit name="heading">Heading</definition.Exit>
      </>
    );
    const [enter, exit] = tree.root
      .findAllByType('Animated.View' as React.ElementType)
      .map((node) => StyleSheet.flatten(node.props.style));
    expect(enter.opacity).toBe(direction === 'forward' ? 0 : 1);
    expect(exit.opacity).toBe(direction === 'forward' ? 1 : 0);
  }
);

test('reduced motion retains the fade but removes reveal translation', async () => {
  mockReducedMotion = true;
  mockProgress.value = 0.5;
  const definition = defineTransition({
    enter: { notes: { during: [0, 1], translateY: 20 } },
  });
  const tree = await mount(
    <definition.Enter name="notes">Notes</definition.Enter>
  );
  expect(
    StyleSheet.flatten(
      tree.root.findByType('Animated.View' as React.ElementType).props.style
    )
  ).toMatchObject({ opacity: 0.5, transform: [{ translateY: 0 }] });
});

test('separate groups reuse role motion without losing endpoint metadata', async () => {
  const definition = defineTransition({
    shared: { icon: { kind: 'bounds' }, value: { kind: 'bounds' } },
  });
  const tree = await mount(
    <>
      <definition.Element name="icon" groupId="token.one">
        One
      </definition.Element>
      <definition.Element name="icon" groupId="token.two">
        Two
      </definition.Element>
      <definition.Element.Target
        name="icon"
        groupId="token.two"
        metadata={{ scale: 2 }}
      />
    </>
  );
  const [one, two] = tree.root.findAllByType('Owner' as React.ElementType);
  const target = tree.root.findByType('Target' as React.ElementType);
  expect(one!.props.groupId).toBe('token.one');
  expect(two!.props.groupId).toBe('token.two');
  expect(one!.props.transition).toBe(two!.props.transition);
  expect(target.props.transition).toBe(two!.props.transition);
  expect(target.props.metadata).toEqual({ scale: 2 });
});

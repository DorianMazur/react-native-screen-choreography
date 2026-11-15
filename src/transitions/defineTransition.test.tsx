import { PortalHost } from 'react-native-teleport';
import { StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import {
  act,
  render as renderComponent,
  type RenderResult,
} from '@testing-library/react-native/pure';
import type {
  Transition,
  SharedElementTransitionRendererProps,
} from '../types';
import { defineTransition } from './defineTransition';
import { makeTransition } from './makeTransition';
import { TransitionFrame } from '../standin/TransitionFrame';
import { TransitionSurface } from '../standin/TransitionSurface';
import { ChoreographyControlsContext } from '../core/ChoreographyContext';
import { ChoreographyProgressContext } from '../core/ChoreographyProgressContext';
import type {
  SessionPhase,
  TransitionDirection,
} from '../core/screenVisibility';

const mockProgress = { value: 0 } as SharedValue<number>;
let mockPhase: SessionPhase = 'active';
let mockDirection: TransitionDirection = 'forward';
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
  useDerivedValue: (fn: () => unknown) => ({
    get value() {
      return fn();
    },
  }),
  interpolateColor: (_value: number, _input: number[], output: string[]) =>
    output[0],
}));

const trees: RenderResult[] = [];
function withProviders(element: React.ReactElement) {
  return (
    <ChoreographyControlsContext.Provider
      value={{ progress: mockProgress, settleTransition: jest.fn() }}
    >
      <ChoreographyProgressContext.Provider
        value={{
          isActive: mockPhase !== 'idle',
          isPendingTarget: false,
          role: 'target',
          phase: mockPhase,
          direction: mockDirection,
          groupId: 'photo',
          sessionId: 'session',
        }}
      >
        {element}
      </ChoreographyProgressContext.Provider>
    </ChoreographyControlsContext.Provider>
  );
}
async function mount(element: React.ReactElement) {
  let tree!: RenderResult;

  tree = renderComponent(withProviders(element));

  trees.push(tree);
  return tree;
}
afterEach(async () => {
  await act(async () => trees.splice(0).forEach((tree) => tree.unmount()));
  mockProgress.value = 0;
  mockPhase = 'active';
  mockDirection = 'forward';
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
  const owner = tree.UNSAFE_root.findByType('Owner' as React.ElementType);
  const target = tree.UNSAFE_root.findByType('Target' as React.ElementType);
  expect(owner.props.id).toBe('hero');
  expect(owner.props.groupId).toBe('photo');
  expect(owner.props.transition).toBe(target.props.transition);
  expect(owner.props.transition.zIndex).toBe(0);
  expect(target.props.children).toBeUndefined();
  const transition = owner.props.transition;
  await act(async () =>
    tree.rerender(
      withProviders(
        <definition.Element name="hero" groupId="photo">
          Updated
        </definition.Element>
      )
    )
  );
  expect(
    tree.UNSAFE_root.findByType('Owner' as React.ElementType).props.transition
  ).toBe(transition);
});

test.each(['bounds', 'surface'] as const)(
  '%s maps endpoints to its primitive without remounting the receiving host',
  async (kind) => {
    const definition = defineTransition({
      shared: { hero: { kind, radius: [8, 0] } },
    });
    const owner = await mount(
      <definition.Element name="hero" groupId="photo">
        Content
      </definition.Element>
    );
    const transition: Transition = owner.UNSAFE_root.findByType(
      'Owner' as React.ElementType
    ).props.transition;
    const small = {
      screenId: 'list',
      metrics: { pageX: 10, pageY: 100, width: 80, height: 100 },
      style: { borderBottomLeftRadius: 30, borderWidth: 2 },
    };
    const big = {
      screenId: 'detail',
      metrics: { pageX: 0, pageY: 0, width: 300, height: 400 },
      style: { borderRadius: 20, borderTopRightRadius: 11 },
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
    const tree = await mount(render('forward'));
    const host = tree.UNSAFE_root.findByType(PortalHost);
    for (const direction of ['forward', 'backward'] as const) {
      await act(async () => tree.rerender(withProviders(render(direction))));
      expect(tree.UNSAFE_root.findAllByType(PortalHost)).toHaveLength(1);
      expect(tree.UNSAFE_root.findByType(PortalHost)).toBe(host);
      const primitive = tree.UNSAFE_root.findByType(
        kind === 'bounds' ? TransitionFrame : TransitionSurface
      );
      expect(primitive.props.progress).toBe(mockProgress);
      expect(primitive.props.direction).toBe(direction);
      expect(primitive.props.sourceMetrics).toBe(
        direction === 'forward' ? small.metrics : big.metrics
      );
      expect(primitive.props.targetMetrics).toBe(
        direction === 'forward' ? big.metrics : small.metrics
      );
      const shape = tree.UNSAFE_root.findAllByType(
        'Animated.View' as React.ElementType
      ).at(-1)!;
      const style = StyleSheet.flatten(shape.props.style);
      // Expansion progress zero is the collapsed shape in either direction.
      expect(style).toMatchObject({ borderRadius: 8, borderWidth: 2 });
      expect(style.borderBottomLeftRadius).toBeUndefined();
      expect(style.borderTopRightRadius).toBeUndefined();
    }
  }
);

test.each(['bounds', 'surface'] as const)(
  '%s interpolates frozen corners and edge widths in both directions',
  async (kind) => {
    const definition = defineTransition({ shared: { card: { kind } } });
    const owner = await mount(
      <definition.Element name="card">Card</definition.Element>
    );
    const { renderer: Renderer }: Transition = owner.UNSAFE_root.findByType(
      'Owner' as React.ElementType
    ).props.transition;
    const metrics = { pageX: 0, pageY: 0, width: 100, height: 100 };
    const small = {
      screenId: 'list',
      metrics,
      style: {
        borderRadius: 8,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 24,
        borderTopWidth: 8,
        borderLeftWidth: 4,
      },
    };
    const boxShadow = [
      {
        offsetX: 1,
        offsetY: 2,
        blurRadius: 8,
        spreadDistance: 0,
        color: 'black',
      },
    ];
    const big = {
      screenId: 'detail',
      metrics,
      style: {
        borderRadius: 16,
        borderTopRightRadius: 4,
        borderBottomRightRadius: 0,
        borderWidth: 4,
        borderBottomWidth: 12,
        borderRightWidth: 0,
        boxShadow,
      },
    };
    mockProgress.value = 0.25;
    for (const direction of ['forward', 'backward'] as const) {
      const tree = await mount(
        <Renderer
          id="card"
          groupId="cards"
          progress={mockProgress}
          direction={direction}
          zIndex={1}
          source={direction === 'forward' ? small : big}
          target={direction === 'forward' ? big : small}
        />
      );
      const layers = tree.UNSAFE_root.findAllByType(
        'Animated.View' as React.ElementType
      ).map((node) => StyleSheet.flatten(node.props.style));
      const corners = {
        borderTopLeftRadius: 4,
        borderTopRightRadius: 7,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 6,
      };
      expect(layers.at(-1)).toMatchObject({
        ...corners,
        overflow: 'hidden',
        borderWidth: 1,
        borderTopWidth: 7,
        borderRightWidth: 0,
        borderBottomWidth: 3,
        borderLeftWidth: 4,
      });
      if (kind === 'surface') {
        const shadow = layers.find((layer) => layer.boxShadow);
        expect(shadow).toMatchObject({ ...corners, boxShadow });
        expect(shadow.borderWidth).toBeUndefined();
      }
    }
  }
);

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
    tree.UNSAFE_root.findByType('Owner' as React.ElementType).props.transition
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
    const [enter, exit] = tree.UNSAFE_root.findAllByType(
      'Animated.View' as React.ElementType
    ).map((node) => StyleSheet.flatten(node.props.style));
    expect(enter.opacity).toBe(direction === 'forward' ? 0 : 1);
    expect(exit.opacity).toBe(direction === 'forward' ? 1 : 0);
  }
);

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
  const [one, two] = tree.UNSAFE_root.findAllByType(
    'Owner' as React.ElementType
  );
  const target = tree.UNSAFE_root.findByType('Target' as React.ElementType);
  expect(one!.props.groupId).toBe('token.one');
  expect(two!.props.groupId).toBe('token.two');
  expect(one!.props.transition).toBe(two!.props.transition);
  expect(target.props.transition).toBe(two!.props.transition);
  expect(target.props.metadata).toEqual({ scale: 2 });
});

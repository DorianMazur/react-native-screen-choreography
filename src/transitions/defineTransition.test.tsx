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
  '%s interpolates the receiving host frame and radius in both directions',
  async (kind) => {
    const radius: [number, number] = [8, 0];
    const definition = defineTransition({ shared: { hero: { kind, radius } } });
    radius[0] = 40;
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
      style: { backgroundColor: '#336699' },
      metrics: { pageX: 10, pageY: 100, width: 80, height: 100 },
    };
    const big = {
      screenId: 'detail',
      style: { backgroundColor: '#336699' },
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
    mockProgress.value = 0.25;
    const tree = await mount(render('forward'));
    const host = tree.UNSAFE_root.findByType(PortalHost);
    for (const direction of ['forward', 'backward'] as const) {
      await act(async () => tree.rerender(withProviders(render(direction))));
      expect(tree.UNSAFE_root.findByType(PortalHost)).toBe(host);
      const styles = tree.UNSAFE_root.findAllByType(
        'Animated.View' as React.ElementType
      ).map((node) => StyleSheet.flatten(node.props.style));
      expect(styles.some((style) => style.backgroundColor === '#336699')).toBe(
        kind === 'surface'
      );
      expect(styles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            width: 135,
            height: 175,
            transform: [{ translateX: 7.5 }, { translateY: 75 }],
          }),
          expect.objectContaining({ borderRadius: 6 }),
        ])
      );
    }
  }
);

test('configuration is captured and custom live renderers remain usable', async () => {
  const spring = { stiffness: 240 };
  const custom = makeTransition({ renderer: () => null });
  const definition = defineTransition({
    motion: { spring },
    shared: { custom },
  });
  spring.stiffness = 999;
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

export function checkTransitionRoleTypes() {
  const definition = defineTransition({
    shared: { hero: { kind: 'bounds' } },
    enter: { notes: {} },
  });
  // @ts-expect-error enter roles are not shared roles
  <definition.Element name="notes">Content</definition.Element>;
  // @ts-expect-error targets use the same shared role names as owners
  <definition.Element.Target name="unknown" />;
  // @ts-expect-error live targets cannot own duplicate content
  <definition.Element.Target name="hero">Duplicate</definition.Element.Target>;
}

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

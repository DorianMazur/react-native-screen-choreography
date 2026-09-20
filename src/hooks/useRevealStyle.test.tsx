import { useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import {
  ChoreographyContext,
  ChoreographyControlsContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { ChoreographyProgressProvider } from '../core/ChoreographyProgressContext';
import { ScreenIdContext } from '../core/screenIdContext';
import {
  SharedElementPresentationContext,
  type SharedElementPresentation,
} from '../core/SharedElementPresentation';
import { defineTransition } from '../transitions/defineTransition';
import type { RevealRecipe, RevealOptions } from '../transitions/reveal';
import type { TransitionSessionData } from '../types';
import { useRevealStyle } from './useRevealStyle';

let mockReducedMotion = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  useReducedMotion: () => mockReducedMotion,
  useAnimatedStyle: (fn: () => unknown) => {
    // A real hook makes changing hook counts observable in the list tests.
    require('react').useRef(null);
    return fn();
  },
}));
jest.mock('react-native-teleport', () => ({ PortalHost: 'PortalHost' }));

const controls = {
  progress: { value: 0 } as ChoreographyContextType['progress'],
  settleTransition: jest.fn(),
};
let session: TransitionSessionData | null;
let pending: string | null;
const trees: ReactTestRenderer[] = [];
beforeEach(() => {
  controls.progress.value = 0;
  pending = null;
  mockReducedMotion = false;
  session = {
    id: 'session',
    groupId: 'photo',
    sourceScreenId: 'list',
    targetScreenId: 'detail',
    state: 'active',
    direction: 'forward',
    pairs: [],
    progress: controls.progress,
  };
});
afterEach(async () => {
  await act(async () => trees.splice(0).forEach((tree) => tree.unmount()));
});

function Harness({
  children,
  screenId = 'detail',
  presentation = null,
}: {
  children: ReactNode;
  screenId?: string;
  presentation?: SharedElementPresentation | null;
}) {
  return (
    <ChoreographyContext.Provider
      value={
        {
          activeSession: session,
          pendingTargetScreenId: pending,
        } as ChoreographyContextType
      }
    >
      <ChoreographyControlsContext.Provider value={controls}>
        <ScreenIdContext.Provider value={screenId}>
          <ChoreographyProgressProvider>
            <SharedElementPresentationContext.Provider value={presentation}>
              {children}
            </SharedElementPresentationContext.Provider>
          </ChoreographyProgressProvider>
        </ScreenIdContext.Provider>
      </ChoreographyControlsContext.Provider>
    </ChoreographyContext.Provider>
  );
}

function Item({
  recipe,
  options,
}: {
  recipe?: RevealRecipe;
  options?: RevealOptions;
}) {
  const style = useRevealStyle(recipe, options);
  return <Animated.View style={style} />;
}
async function mount(element: React.ReactElement) {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  trees.push(tree);
  return tree;
}
function styles(tree: ReactTestRenderer) {
  return tree.root
    .findAllByType('Animated.View' as React.ElementType)
    .map((node) => StyleSheet.flatten(node.props.style));
}

test.each([
  'preparing',
  'measuring',
  'active',
  'completing',
  'cancelling',
] as const)(
  'unrelated screens remain fully visible during %s',
  async (state) => {
    session!.state = state;
    controls.progress.value = 0.5;
    const tree = await mount(
      <Harness screenId="unrelated">
        <Item
          recipe={{
            during: [0, 1],
            translateX: 20,
            translateY: 10,
            scale: 0.5,
          }}
        />
        <Item recipe={{ during: [0, 1] }} options={{ mode: 'exit' }} />
      </Harness>
    );
    expect(styles(tree).map((style) => style.opacity)).toEqual([1, 1]);
    expect(styles(tree)[0].transform).toEqual([
      { translateY: 0 },
      { translateX: 0 },
      { scale: 1 },
    ]);
  }
);

test('pending destinations prepare from collapsed even with stale progress and no session', async () => {
  session = null;
  pending = 'detail';
  controls.progress.value = 1;
  const tree = await mount(
    <Harness>
      <Item />
      <Item options={{ mode: 'exit' }} />
    </Harness>
  );
  expect(styles(tree).map((style) => style.opacity)).toEqual([0, 1]);
});

test('a pending destination is scoped separately from an unrelated active session', async () => {
  pending = 'next';
  controls.progress.value = 1;
  const tree = await mount(
    <Harness screenId="next">
      <Item />
    </Harness>
  );
  expect(styles(tree)[0].opacity).toBe(0);
});

test.each(['forward', 'backward'] as const)(
  'participating screens prepare from the %s endpoint',
  async (direction) => {
    session!.direction = direction;
    session!.state = 'preparing';
    controls.progress.value = direction === 'forward' ? 1 : 0;
    const tree = await mount(
      <Harness>
        <Item />
        <Item options={{ mode: 'exit' }} />
      </Harness>
    );
    expect(styles(tree).map((style) => style.opacity)).toEqual(
      direction === 'forward' ? [0, 1] : [1, 0]
    );
  }
);

test('screen content is visible on standalone entry and after settlement', async () => {
  const render = () => (
    <Harness>
      <Item />
      <Item options={{ mode: 'exit' }} />
    </Harness>
  );
  session = null;
  const tree = await mount(render());
  expect(styles(tree).map((style) => style.opacity)).toEqual([1, 1]);
  controls.progress.value = 1;
  await act(async () => tree.update(render()));
  expect(styles(tree).map((style) => style.opacity)).toEqual([1, 1]);
});

test('translations and scale reverse with progress, including cancellation', async () => {
  const render = () => (
    <Harness>
      <Item
        recipe={{ during: [0, 1], translateX: -20, translateY: 40, scale: 0.5 }}
      />
    </Harness>
  );
  const tree = await mount(render());
  for (const progress of [0, 0.5, 1, 0.5, 0, 0.5, 1]) {
    controls.progress.value = progress;
    await act(async () => tree.update(render()));
    expect(styles(tree)[0]).toEqual({
      opacity: progress,
      transform: [
        { translateY: (1 - progress) * 40 },
        { translateX: (1 - progress) * -20 },
        { scale: 0.5 + 0.5 * progress },
      ],
    });
  }
});

test('reduced motion preserves opacity and disables translation and scale', async () => {
  mockReducedMotion = true;
  controls.progress.value = 0.5;
  const tree = await mount(
    <Harness>
      <Item
        recipe={{ during: [0, 1], translateX: 20, translateY: 30, scale: 0.2 }}
      />
    </Harness>
  );
  expect(styles(tree)[0]).toEqual({
    opacity: 0.5,
    transform: [{ translateY: 0 }, { translateX: 0 }, { scale: 1 }],
  });
});

test('presentation reveals follow only their owner, including collapsed and expanded idle', async () => {
  const presentationProgress = {
    value: 0,
  } as SharedElementPresentation['presentationProgress'];
  const presentation: SharedElementPresentation = {
    progress: controls.progress,
    presentationProgress,
    transitioning: false,
    direction: null,
    settled: 'collapsed',
    collapsed: { metrics: null },
    expanded: { metrics: null },
  };
  const definition = defineTransition({
    enter: { detail: { during: [0, 1] } },
    exit: { caption: { during: [0, 1] } },
  });
  const render = () => (
    <Harness screenId="unrelated" presentation={presentation}>
      <definition.Enter name="detail" scope="presentation">
        Detail
      </definition.Enter>
      <definition.Exit name="caption" scope="presentation">
        Caption
      </definition.Exit>
    </Harness>
  );
  const tree = await mount(render());
  for (const progress of [1, 0.5, 0]) {
    controls.progress.value = progress;
    await act(async () => tree.update(render()));
    expect(styles(tree).map((style) => style.opacity)).toEqual([0, 1]);
  }
  for (const amount of [0.5, 1, 0.5, 0, 1]) {
    (presentationProgress as { value: number }).value = amount;
    await act(async () => tree.update(render()));
    expect(styles(tree).map((style) => style.opacity)).toEqual([
      amount,
      1 - amount,
    ]);
  }
  session = null;
  await act(async () => tree.update(render()));
  expect(styles(tree).map((style) => style.opacity)).toEqual([1, 0]);
});

test.each(['hook', 'component'] as const)(
  '%s supports adding, removing and reordering list items without remounting survivors',
  async (api) => {
    let nextInstance = 0;
    const instances = new Map<string, number>();
    const definition = defineTransition({
      enter: { row: { during: [0, 1], stagger: 0.2 } },
    });
    function Row({
      id,
      index,
      count,
    }: {
      id: string;
      index: number;
      count: number;
    }) {
      const [instance] = useState(() => ++nextInstance);
      instances.set(id, instance);
      const motion = useRevealStyle(
        { during: [0, 1], stagger: 0.2 },
        { index, count }
      );
      return api === 'hook' ? (
        <Animated.View style={motion} />
      ) : (
        <definition.Enter name="row" index={index} count={count}>
          {id}
        </definition.Enter>
      );
    }
    const render = (ids: string[]) => (
      <Harness>
        {ids.map((id, index) => (
          <Row key={id} id={id} index={index} count={ids.length} />
        ))}
      </Harness>
    );
    const tree = await mount(render([]));
    for (const ids of [['a'], ['a', 'b', 'c'], ['c', 'a'], [], ['d']]) {
      const previous = new Map(instances);
      await act(async () => tree.update(render(ids)));
      expect(styles(tree)).toHaveLength(ids.length);
      for (const id of ids)
        if (previous.has(id)) expect(instances.get(id)).toBe(previous.get(id));
    }
  }
);

test('stagger starts items in order and all items finish inside the group interval', async () => {
  const definition = defineTransition({
    enter: { row: { during: [0.2, 0.8], stagger: 0.1 } },
  });
  const render = (count: number) => (
    <Harness>
      {Array.from({ length: count }, (_, index) => (
        <definition.Enter key={index} name="row" index={index} count={count}>
          {index}
        </definition.Enter>
      ))}
    </Harness>
  );
  controls.progress.value = 0.4;
  const tree = await mount(render(3));
  const amounts = styles(tree).map((style) => style.opacity);
  expect(amounts[0]).toBeCloseTo(0.5);
  expect(amounts[1]).toBeCloseTo(0.25);
  expect(amounts[2]).toBeCloseTo(0);
  for (const progress of [0.8, 0.2, 0.8]) {
    controls.progress.value = progress;
    await act(async () => tree.update(render(100)));
    expect(
      styles(tree).every(
        (style) => style.opacity === (progress === 0.8 ? 1 : 0)
      )
    ).toBe(true);
  }
});

test.each([
  { translateX: NaN },
  { translateY: Infinity },
  { scale: -1 },
  { scale: Infinity },
  { stagger: -1 },
  { stagger: NaN },
] as RevealRecipe[])(
  'rejects invalid recipe %p at definition time',
  (recipe) => {
    expect(() => defineTransition({ enter: { row: recipe } })).toThrow();
  }
);

test.each([
  { index: -1 },
  { index: 0.5 },
  { index: 1, count: 1 },
  { count: 0 },
  { count: 2.5 },
  { count: Infinity },
] as RevealOptions[])('rejects invalid item position %p', async (options) => {
  await expect(
    mount(
      <Harness>
        <Item options={options} />
      </Harness>
    )
  ).rejects.toThrow('Reveal');
});

test('presentation scope fails clearly when used outside an owner', async () => {
  await expect(
    mount(
      <Harness>
        <Item options={{ scope: 'presentation' }} />
      </Harness>
    )
  ).rejects.toThrow('SharedElement owner');
});

test('named reveal recipes keep their captured values after external mutation', async () => {
  const recipe = {
    during: [0, 1] as [number, number],
    stagger: 0.2,
    translateX: 20,
    scale: 0.5,
  };
  const definition = defineTransition({ enter: { row: recipe } });
  recipe.during[0] = 0.9;
  recipe.stagger = 1;
  recipe.translateX = 100;
  recipe.scale = 0;
  controls.progress.value = 0.4;
  const tree = await mount(
    <Harness>
      <definition.Enter name="row" index={1} count={2}>
        Content
      </definition.Enter>
    </Harness>
  );
  expect(styles(tree)[0]).toMatchObject({
    opacity: 0.25,
    transform: [{ translateY: 0 }, { translateX: 15 }, { scale: 0.625 }],
  });
});

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type {
  TransitionRendererProps,
  SharedElementTransitionRendererProps,
  SharedElementTransitionSide,
} from '../types';
import { defaultTransition, makeTransition } from './makeTransition';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
}));

jest.mock('react-native-teleport', () => ({
  PortalHost: 'PortalHost',
}));

const { PortalHost } = jest.requireMock('react-native-teleport') as {
  PortalHost: React.ElementType;
};

const metrics = {
  pageX: 11,
  pageY: 22,
  width: 33,
  height: 44,
};

type AdapterRuntimeProps = Omit<
  SharedElementTransitionRendererProps,
  'source' | 'target'
> & {
  source: SharedElementTransitionSide & { metadata?: unknown };
  target: SharedElementTransitionSide & { metadata?: unknown };
};

function rendererProps(
  overrides: Partial<AdapterRuntimeProps> = {}
): AdapterRuntimeProps {
  return {
    id: 'player',
    groupId: 'media',
    progress: { value: 0 } as SharedElementTransitionRendererProps['progress'],
    direction: 'forward',
    zIndex: 100,
    source: {
      screenId: 'feed:one',
      metrics,
      metadata: { label: 'source-v1' },
    },
    target: {
      screenId: 'detail:two',
      metrics: { pageX: 55, pageY: 66, width: 77, height: 88 },
      metadata: { label: 'target-v1' },
    },
    ...overrides,
  };
}

describe('makeTransition', () => {
  test.each(['forward', 'backward'] as const)(
    'default bounds preserve visual geometry and one live host during %s motion',
    async (direction) => {
      const endpoints = rendererProps();
      const progress = { value: 0 } as AdapterRuntimeProps['progress'];
      const props = rendererProps({
        direction,
        progress,
        source: direction === 'forward' ? endpoints.source : endpoints.target,
        target: direction === 'forward' ? endpoints.target : endpoints.source,
      });
      // Height retains the existing expansion curve; X/Y/width stay linear.
      const frames = [
        { progress: 0, x: 11, y: 22, width: 33, height: 44 },
        { progress: 0.25, x: 22, y: 33, width: 44, height: 63.25 },
        { progress: 0.5, x: 33, y: 44, width: 55, height: 77 },
        { progress: 0.75, x: 44, y: 55, width: 66, height: 85.25 },
        { progress: 1, x: 55, y: 66, width: 77, height: 88 },
      ];
      const sequence = direction === 'forward' ? frames : [...frames].reverse();
      let tree!: ReactTestRenderer;
      try {
        for (const frame of sequence) {
          progress.value = frame.progress;
          await act(async () => {
            const content = React.createElement(
              defaultTransition.renderer,
              props
            );
            if (tree) tree.update(content);
            else tree = create(content);
          });
          const overlay = tree.root.findByType(
            'Animated.View' as React.ElementType
          );
          const styles = StyleSheet.flatten(overlay.props.style);
          expect(styles.left).toBe(0);
          expect(styles.top).toBe(0);
          expect(styles.transform).toEqual([
            { translateX: frame.x },
            { translateY: frame.y },
          ]);
          expect(styles.left + styles.transform[0].translateX).toBe(frame.x);
          expect(styles.top + styles.transform[1].translateY).toBe(frame.y);
          expect(styles.width).toBeCloseTo(frame.width);
          expect(styles.height).toBeCloseTo(frame.height);
          expect(styles.overflow).toBe('hidden');
          expect(tree.root.findAllByType(PortalHost)).toHaveLength(1);
        }
      } finally {
        await act(async () => tree?.unmount());
      }
    }
  );

  test('defaults zIndex to 100 while retaining explicit zero', () => {
    const Renderer = () => null;

    expect(makeTransition({ renderer: Renderer })).toMatchObject({
      zIndex: 100,
    });
    expect(makeTransition({ renderer: Renderer, zIndex: 0 })).toMatchObject({
      zIndex: 0,
    });
  });

  test('injects the exact pair host and strips frozen presentation content', async () => {
    const render = jest.fn((_props: TransitionRendererProps) => null);
    function Renderer(props: TransitionRendererProps) {
      render(props);
      return props.children;
    }
    const transition = makeTransition({ renderer: Renderer });
    const props = rendererProps();
    let tree!: ReactTestRenderer;

    try {
      await act(async () => {
        tree = create(React.createElement(transition.renderer, props));
      });

      const received = render.mock.calls[0]![0];
      expect(received).toMatchObject({
        id: 'player',
        groupId: 'media',
        direction: 'forward',
        zIndex: 100,
        source: {
          screenId: 'feed:one',
          metrics,
          metadata: { label: 'source-v1' },
        },
        target: {
          screenId: 'detail:two',
          metrics: { pageX: 55, pageY: 66, width: 77, height: 88 },
          metadata: { label: 'target-v1' },
        },
      });
      expect(received.progress).toBe(props.progress);
      expect(received.source).not.toHaveProperty('content');
      expect(received.target).not.toHaveProperty('content');

      const host = tree.root.findByType(PortalHost);
      expect(host.props.name).toBe(
        'screen-choreography:live:overlay:["feed:one","detail:two","media","player"]'
      );
      expect(host.props.style).toMatchObject({
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      });

      props.progress.value = 0.75;
      expect(received.progress.value).toBe(0.75);
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test('keeps geometry and metadata independent for source and target', async () => {
    let received!: TransitionRendererProps;
    function Renderer(props: TransitionRendererProps) {
      received = props;
      return props.children;
    }
    const transition = makeTransition({ renderer: Renderer, zIndex: 314 });
    const props = rendererProps({ direction: 'backward', zIndex: 314 });
    let tree!: ReactTestRenderer;

    try {
      await act(async () => {
        tree = create(React.createElement(transition.renderer, props));
      });

      expect(received.source.metrics).toBe(props.source.metrics);
      expect(received.target.metrics).toBe(props.target.metrics);
      expect(received.source.metrics).not.toEqual(received.target.metrics);
      expect(received.source.metadata).toBe(props.source.metadata);
      expect(received.target.metadata).toBe(props.target.metadata);
      expect(received.direction).toBe('backward');
      expect(received.zIndex).toBe(314);
    } finally {
      await act(async () => tree?.unmount());
    }
  });

  test('keeps the custom renderer mounted across ordinary presentation updates', async () => {
    const mounts = jest.fn();
    const unmounts = jest.fn();
    function Renderer({ children }: TransitionRendererProps) {
      React.useEffect(() => {
        mounts();
        return unmounts;
      }, []);
      return children;
    }
    const transition = makeTransition({ renderer: Renderer });
    const first = rendererProps();
    const second = rendererProps({
      source: {
        ...first.source,
        metadata: { label: 'source-v2' },
      },
    });
    let tree!: ReactTestRenderer;

    try {
      await act(async () => {
        tree = create(React.createElement(transition.renderer, first));
      });
      await act(async () => {
        tree.update(React.createElement(transition.renderer, second));
      });

      expect(mounts).toHaveBeenCalledTimes(1);
      expect(unmounts).not.toHaveBeenCalled();
    } finally {
      await act(async () => tree?.unmount());
    }
    expect(unmounts).toHaveBeenCalledTimes(1);
  });

  test('names hosts collision-safely across screen pairs and groups', async () => {
    function Renderer({ children }: TransitionRendererProps) {
      return children;
    }
    const transition = makeTransition({ renderer: Renderer });
    const cases = [
      rendererProps(),
      rendererProps({
        source: { ...rendererProps().source, screenId: 'feed' },
        target: { ...rendererProps().target, screenId: 'one:detail:two' },
      }),
      rendererProps({ groupId: 'media:alternate' }),
    ];
    const names: string[] = [];

    for (const props of cases) {
      let tree!: ReactTestRenderer;
      try {
        await act(async () => {
          tree = create(React.createElement(transition.renderer, props));
        });
        names.push(tree.root.findByType(PortalHost).props.name);
      } finally {
        await act(async () => tree?.unmount());
      }
    }

    expect(new Set(names).size).toBe(cases.length);
  });
});

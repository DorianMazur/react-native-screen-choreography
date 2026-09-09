import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import type {
  ElementTransitionPair,
  SharedElementTransition,
  SharedElementTransitionRendererProps,
  TransitionSessionData,
} from '../types';
import {
  ElementVisibilityRegistry,
  finishVisibilityHandoff,
  resumeVisibilityHandoff,
} from './ElementVisibilityRegistry';
import { TransitionOverlay } from './TransitionOverlay';
import { makeLiveTransition } from '../transitions/makeLiveTransition';
import type { LiveTransitionRendererProps } from '../types';

jest.mock('react-native-teleport', () => ({
  PortalHost: 'PortalHost',
}));

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
  useAnimatedStyle: (update: () => { opacity: number }) =>
    Object.defineProperty({}, 'opacity', {
      enumerable: true,
      get: () => update().opacity,
    }),
}));

function visibleOpacity(node: ReactTestInstance): number {
  let opacity = 1;
  let current: ReactTestInstance | null = node;
  while (current) {
    if (typeof current.type === 'string') {
      opacity *= StyleSheet.flatten(current.props.style)?.opacity ?? 1;
    }
    current = current.parent;
  }
  return opacity;
}

test('renders frozen live metadata while preserving evolving shared refs', async () => {
  const sourceLive = { value: 0 };
  const targetLive = { value: 1 };
  let received!: LiveTransitionRendererProps;
  const transition = makeLiveTransition({
    renderer: (props) => {
      received = props;
      return props.children;
    },
  });
  const sourceMetrics = { pageX: 1, pageY: 2, width: 240, height: 160 };
  const targetMetrics = { pageX: 3, pageY: 4, width: 280, height: 180 };
  const unavailable = () => {
    throw new Error('overlay must not recapture a presentation');
  };
  const source = {
    id: 'player',
    groupId: 'media',
    screenId: 'list',
    ref: () => null,
    metrics: sourceMetrics,
    getPresentation: unavailable,
  };
  const target = {
    ...source,
    screenId: 'detail',
    metrics: targetMetrics,
  };
  const pair: ElementTransitionPair = {
    id: 'player',
    source,
    target,
    sourceMetrics,
    targetMetrics,
    sourcePresentation: {
      content: 'must not leak',
      transition,
      metadata: { revision: 'source-captured', live: sourceLive },
    },
    targetPresentation: {
      content: 'must not leak',
      transition,
      metadata: { revision: 'target-captured', live: targetLive },
    },
    transition,
  };
  const progress = { value: 0.4 } as TransitionSessionData['progress'];
  const session: TransitionSessionData = {
    id: 'live-session',
    groupId: 'media',
    sourceScreenId: 'list',
    targetScreenId: 'detail',
    state: 'active',
    direction: 'backward',
    progress,
    pairs: [pair],
  };
  const handoff = {
    value: { sessionId: session.id, completed: false },
  };
  let tree!: ReactTestRenderer;

  try {
    await act(async () => {
      tree = create(
        <TransitionOverlay
          session={session}
          progress={progress}
          handoff={handoff as never}
        />
      );
    });

    expect(received.source).toMatchObject({
      screenId: 'list',
      metrics: sourceMetrics,
      metadata: { revision: 'source-captured' },
    });
    expect(received.target).toMatchObject({
      screenId: 'detail',
      metrics: targetMetrics,
      metadata: { revision: 'target-captured' },
    });
    expect(received.source).not.toHaveProperty('content');
    expect(received.target).not.toHaveProperty('content');

    sourceLive.value = 0.25;
    targetLive.value = 0.75;
    expect(
      (received.source.metadata as { live: { value: number } }).live.value
    ).toBe(0.25);
    expect(
      (received.target.metadata as { live: { value: number } }).live.value
    ).toBe(0.75);
  } finally {
    await act(async () => tree?.unmount());
  }
});

test.each(['forward', 'backward'] as const)(
  'keeps live content visible at %s completion until React reparents it',
  async (direction) => {
    const mounts = jest.fn();
    function Renderer({ id }: SharedElementTransitionRendererProps) {
      useEffect(() => {
        mounts(id);
      }, [id]);
      return <View testID={id} />;
    }
    function pair(
      id: string,
      mode: SharedElementTransition['mode']
    ): ElementTransitionPair {
      const metrics = { pageX: 0, pageY: 0, width: 100, height: 100 };
      const transition = { renderer: Renderer, mode };
      const presentation = { content: null, transition };
      const source = {
        id,
        groupId: 'group',
        screenId: 'source',
        ref: () => null,
        metrics,
        getPresentation: () => presentation,
      };
      return {
        id,
        source,
        target: { ...source, screenId: 'target' },
        sourceMetrics: metrics,
        targetMetrics: metrics,
        sourcePresentation: presentation,
        targetPresentation: presentation,
        transition,
      };
    }
    const visibility = new ElementVisibilityRegistry();
    const real = visibility.get('surface', false);
    const progress = {
      value: direction === 'forward' ? 0 : 1,
    } as TransitionSessionData['progress'];
    const session: TransitionSessionData = {
      id: 'session',
      groupId: 'group',
      sourceScreenId: 'source',
      targetScreenId: 'target',
      state: 'active',
      direction,
      progress,
      pairs: [pair('surface', 'standin'), pair('player', 'live')],
    };
    let tree!: ReactTestRenderer;
    try {
      await act(async () => {
        tree = create(
          <TransitionOverlay
            session={session}
            progress={progress}
            handoff={visibility.handoff}
          />
        );
      });
      const surface = tree.root.findAllByProps({ testID: 'surface' }).at(-1)!;
      const player = tree.root.findAllByProps({ testID: 'player' }).at(-1)!;
      expect(visibleOpacity(surface)).toBe(0);
      expect(visibleOpacity(player)).toBe(0);

      visibility.sync(new Set(['surface']), session.id);
      expect(real.value).toBe(1);
      expect(visibleOpacity(surface)).toBe(1);
      expect(visibleOpacity(player)).toBe(1);

      progress.value = direction === 'forward' ? 1 : 0;
      finishVisibilityHandoff(visibility.handoff, session.id);
      expect(real.value).toBe(0);
      expect(visibleOpacity(surface)).toBe(0);
      expect(visibleOpacity(player)).toBe(1);
      expect(mounts.mock.calls).toEqual([['surface'], ['player']]);

      resumeVisibilityHandoff(visibility.handoff, session.id);
      expect(real.value).toBe(1);
      expect(visibleOpacity(surface)).toBe(1);
      expect(visibleOpacity(player)).toBe(1);

      visibility.sync(new Set(['surface']), 'replacement');
      expect(visibleOpacity(surface)).toBe(0);
      expect(visibleOpacity(player)).toBe(0);
    } finally {
      await act(async () => tree?.unmount());
    }
  }
);

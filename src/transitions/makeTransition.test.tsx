import React from 'react';
import {
  act,
  render as renderComponent,
  type RenderResult,
} from '@testing-library/react-native/pure';
import type {
  TransitionRendererProps,
  SharedElementTransitionRendererProps,
  SharedElementTransitionSide,
} from '../types';
import { makeTransition } from './makeTransition';
import { PortalHost } from 'react-native-teleport';
import { View } from 'react-native';

jest.mock('react-native-teleport', () => ({ PortalHost: 'PortalHost' }));

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  __esModule: true,
}));

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
  test('defaults zIndex to 100 while retaining explicit zero', () => {
    const Renderer = () => null;

    expect(makeTransition({ renderer: Renderer })).toMatchObject({
      zIndex: 100,
    });
    expect(makeTransition({ renderer: Renderer, zIndex: 0 })).toMatchObject({
      zIndex: 0,
    });
  });

  test('forwards both endpoints and supplies the matching native host', async () => {
    const render = jest.fn((_props: TransitionRendererProps) => null);
    function Renderer(props: TransitionRendererProps) {
      render(props);
      return props.children;
    }
    const transition = makeTransition({ renderer: Renderer });
    const props = rendererProps({ direction: 'backward', zIndex: 314 });
    let tree!: RenderResult;

    try {
      tree = renderComponent(React.createElement(transition.renderer, props));

      const received = render.mock.calls[0]![0];
      expect(received).toMatchObject({
        id: 'player',
        groupId: 'media',
        direction: 'backward',
        zIndex: 314,
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

      const host = tree.UNSAFE_root.findByType(PortalHost);
      expect(host.props.name).toBe(
        'screen-choreography:live:overlay:["feed:one","detail:two","media","player"]'
      );
      const marker = host.findByType(View);
      expect(marker.props.nativeID).toBe(host.props.name);
      expect(marker.props.testID).toBeUndefined();
      expect(marker.props.collapsable).toBe(false);
      expect(marker.props.children).toBeUndefined();
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
    let tree!: RenderResult;

    try {
      tree = renderComponent(React.createElement(transition.renderer, first));

      await act(async () => {
        tree.rerender(React.createElement(transition.renderer, second));
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
      let tree!: RenderResult;
      try {
        tree = renderComponent(React.createElement(transition.renderer, props));

        names.push(tree.UNSAFE_root.findByType(PortalHost).props.name);
      } finally {
        await act(async () => tree?.unmount());
      }
    }

    expect(new Set(names).size).toBe(cases.length);
  });
});

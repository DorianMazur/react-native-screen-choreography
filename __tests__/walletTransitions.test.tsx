import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';
import {
  tokenTextTransition,
  tokenValueTransition,
} from '../examples/shared/wallet/walletTransitions';
import type { SharedElementTransitionRendererProps } from '../src/types';

let mockReducedMotion = false;

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  __esModule: true,
  default: { View: 'AnimatedView' },
  useReducedMotion: () => mockReducedMotion,
}));

const list = {
  screenId: 'TokenList',
  metrics: { pageX: 270, pageY: 430, width: 100, height: 20 },
  content: 'list text',
};
const detail = {
  screenId: 'TokenDetail',
  metrics: { pageX: 24, pageY: 210, width: 240, height: 48 },
  content: 'detail text',
};

describe('Wallet text choreography', () => {
  let tree: ReactTestRenderer;

  beforeEach(() => {
    mockReducedMotion = false;
  });

  async function render(
    direction: SharedElementTransitionRendererProps['direction'],
    value: number,
    Renderer = tokenTextTransition.renderer
  ) {
    const props: SharedElementTransitionRendererProps = {
      id: 'token.polygon.value',
      groupId: 'token.polygon',
      zIndex: 1,
      direction,
      progress: makeMutable(value),
      source: direction === 'forward' ? list : detail,
      target: direction === 'forward' ? detail : list,
    };
    await act(async () => {
      tree = create(<Renderer {...props} />);
    });
    const view = tree.root.findByType('AnimatedView' as React.ElementType);
    const result = {
      style: StyleSheet.flatten(view.props.style),
      content: view.props.children,
    };
    await act(async () => tree.unmount());
    return result;
  }

  test.each([0, 0.2, 0.5, 0.8, 1])(
    'the price arc retraces the same frame at progress %s',
    async (value) => {
      const forward = await render(
        'forward',
        value,
        tokenValueTransition.renderer
      );
      const backward = await render(
        'backward',
        value,
        tokenValueTransition.renderer
      );
      expect(backward).toEqual(forward);
      if (value === 0 || value === 1) {
        expect(forward).toEqual(await render('forward', value));
      }
    }
  );

  test('the price lifts gently without layout writes and respects reduced motion', async () => {
    const arced = await render('forward', 0.5, tokenValueTransition.renderer);
    expect(arced.style.transform).toEqual([
      { translateX: -123 },
      { translateY: -138 },
      { scale: expect.closeTo((1 + 20 / 48) / 2) },
    ]);
    mockReducedMotion = true;
    expect(await render('forward', 0.5, tokenValueTransition.renderer)).toEqual(
      await render('forward', 0.5)
    );
  });

  test.each([0, 0.25, 0.5, 0.75, 1])(
    'forward and Back share the same frame at progress %s',
    async (value) => {
      const forward = await render('forward', value);
      const backward = await render('backward', value);
      expect(backward).toEqual(forward);
      expect(forward.content).toBe('detail text');
    }
  );

  test('matches both measured endpoints using transforms, without per-frame layout writes', async () => {
    const collapsed = await render('forward', 0);
    const expanded = await render('forward', 1);
    expect(collapsed.style).toMatchObject({
      left: 270,
      top: 430,
      width: 240,
      height: 48,
    });
    expect(collapsed.style.transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
      { scale: 20 / 48 },
    ]);
    expect(expanded.style).toMatchObject({
      left: 270,
      top: 430,
      width: 240,
      height: 48,
    });
    expect(expanded.style.transform).toEqual([
      { translateX: -246 },
      { translateY: -220 },
      { scale: 1 },
    ]);
  });
});

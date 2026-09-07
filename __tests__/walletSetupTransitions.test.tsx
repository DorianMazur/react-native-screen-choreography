import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { makeMutable } from 'react-native-reanimated';
import { setupOptionTransition } from '../examples/shared/wallet-setup/setupTransitions';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  Easing: jest.requireActual('react-native').Easing,
  __esModule: true,
  default: { View: 'AnimatedView' },
}));

const compact = {
  screenId: 'WalletSetup',
  metrics: { pageX: 32, pageY: 480, width: 326, height: 96 },
  content: 'Create new',
  style: { backgroundColor: '#242A26', borderRadius: 8 },
};
const expanded = {
  screenId: 'WalletExisting',
  metrics: { pageX: 24, pageY: 420, width: 342, height: 108 },
  content: 'Log in to your account',
  style: { backgroundColor: '#191C1A', borderRadius: 8 },
};

async function render(direction: 'forward' | 'backward', value: number) {
  const Renderer = setupOptionTransition.renderer;
  let tree: ReactTestRenderer;
  await act(async () => {
    tree = create(
      <Renderer
        id="wallet-setup.option.0"
        groupId="wallet-setup"
        zIndex={2}
        direction={direction}
        progress={makeMutable(value)}
        source={direction === 'forward' ? compact : expanded}
        target={direction === 'forward' ? expanded : compact}
      />
    );
  });
  const views = tree!.root.findAllByType('AnimatedView' as React.ElementType);
  const result = {
    frame: StyleSheet.flatten(views[0]!.props.style),
    layers: views.slice(1).map((view) => ({
      style: StyleSheet.flatten(view.props.style),
      content: view.props.children,
    })),
  };
  await act(async () => tree!.unmount());
  return result;
}

describe('Wallet setup option choreography', () => {
  test.each([0, 0.2, 0.48, 0.65, 1])(
    'Back retraces the same frame at expansion %s',
    async (value) => {
      expect(await render('backward', value)).toEqual(
        await render('forward', value)
      );
    }
  );

  test('matches measured endpoints and swaps the frozen content', async () => {
    const start = await render('forward', 0);
    const end = await render('forward', 1);
    expect(start.frame).toMatchObject({
      left: 32,
      top: 480,
      width: 326,
      height: 96,
    });
    expect(end.frame).toMatchObject({
      left: 24,
      top: 420,
      width: 342,
      height: 108,
    });
    expect(start.layers.map((layer) => layer.style.opacity)).toEqual([1, 0]);
    expect(end.layers.map((layer) => layer.style.opacity)).toEqual([0, 1]);
    expect(end.layers.map((layer) => layer.content)).toEqual([
      'Create new',
      'Log in to your account',
    ]);
  });

  describe.each(['forward', 'backward'] as const)(
    '%s crossfade',
    (direction) => {
      test.each([
        [0.345, 0.0625],
        [0.635, 0.9375],
      ])('eases the blend at expansion %s', async (value, opacity) => {
        const { layers } = await render(direction, value);
        expect(layers[0]!.style.opacity).toBeCloseTo(1 - opacity!);
        expect(layers[1]!.style.opacity).toBeCloseTo(opacity!);
      });

      test.each([-0.1, 0, 0.2, 0.35, 0.48, 0.49, 0.6, 0.78, 1, 1.1])(
        'keeps complementary opacities at expansion %s',
        async (value) => {
          const { layers } = await render(direction, value);
          const compactOpacity = layers[0]!.style.opacity;
          const expandedOpacity = layers[1]!.style.opacity;
          expect(compactOpacity + expandedOpacity).toBeCloseTo(1);
          expect(compactOpacity).toBeGreaterThanOrEqual(0);
          expect(compactOpacity).toBeLessThanOrEqual(1);
          expect(expandedOpacity).toBeGreaterThanOrEqual(0);
          expect(expandedOpacity).toBeLessThanOrEqual(1);
          if (value > 0.2 && value < 0.78) {
            expect(compactOpacity).toBeGreaterThan(0);
            expect(expandedOpacity).toBeGreaterThan(0);
          }
        }
      );

      test('blends both layers equally at the fade midpoint', async () => {
        const { layers } = await render(direction, 0.49);
        expect(layers[0]!.style.opacity).toBeCloseTo(0.5);
        expect(layers[1]!.style.opacity).toBeCloseTo(0.5);
      });
    }
  );
});

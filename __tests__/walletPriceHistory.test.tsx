import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { PriceHistory } from '../examples/shared/wallet/PriceHistory';
import { TOKENS } from '../examples/shared/wallet/data';

let mockTransition = {
  progress: { value: 1 },
  phase: 'idle',
  direction: null as string | null,
};
let mockReducedMotion = false;
const mockOnInteract = jest.fn();

jest.mock('../examples/shared/runtime', () => ({
  useChoreographyProgress: () => mockTransition,
}));

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  __esModule: true,
  default: { View: 'AnimatedView' },
  useDerivedValue: (compute: () => number) => ({ value: compute() }),
  useReducedMotion: () => mockReducedMotion,
}));

describe('Wallet price history choreography', () => {
  let tree: ReactTestRenderer;

  beforeEach(async () => {
    mockTransition = { progress: { value: 1 }, phase: 'idle', direction: null };
    mockReducedMotion = false;
    mockOnInteract.mockClear();
    await act(async () => {
      tree = create(
        <PriceHistory token={TOKENS[0]!} onInteract={mockOnInteract} />
      );
    });
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
  });

  async function frame(phase: string, direction: string | null, value: number) {
    mockTransition = { phase, direction, progress: { value } };
    await act(async () => {
      tree.update(
        <PriceHistory token={TOKENS[0]!} onInteract={mockOnInteract} />
      );
    });
    return tree.root
      .findAllByType('AnimatedView' as React.ElementType)
      .map((bar) => StyleSheet.flatten(bar.props.style));
  }

  test.each([0, 0.42, 0.6, 0.8, 1])(
    'the chart retraces the same frame at progress %s',
    async (value) => {
      expect(await frame('active', 'backward', value)).toEqual(
        await frame('active', 'forward', value)
      );
    }
  );

  test('bars unfold from left to right without changing layout dimensions', async () => {
    const midway = await frame('active', 'forward', 0.6);
    const settled = await frame('idle', null, 1);
    expect(midway).toHaveLength(24);
    expect(midway[0].transform[0].scaleY).toBeGreaterThan(0.9);
    expect(midway[23].transform[0].scaleY).toBe(0);
    midway.forEach((bar, index) => {
      expect(bar.height).toBe(settled[index].height);
      expect(bar.width).toBe('100%');
      expect(bar.transformOrigin).toBe('bottom');
      expect(settled[index].transform).toEqual([{ scaleY: 1 }]);
    });
  });

  test('pending entry ignores stale progress, while direct entry and reverse preparation stay complete', async () => {
    const pending = await frame('preparing', null, 1);
    expect(pending.every((bar) => bar.opacity === 0)).toBe(true);
    const settled = await frame('idle', null, 0);
    expect(settled.every((bar) => bar.transform[0].scaleY === 1)).toBe(true);
    expect(await frame('preparing', 'backward', 1)).toEqual(settled);
  });

  test('reduced motion uses a simultaneous fade without scaling', async () => {
    mockReducedMotion = true;
    const bars = await frame('active', 'forward', 0.6);
    bars.forEach((bar, index) => {
      expect(bar.transform).toEqual([{ scaleY: 1 }]);
      expect(bar.opacity / (0.45 + (index / 23) * 0.55)).toBeCloseTo(0.6);
    });
  });

  test('changing the period settles navigation and updates selection without hiding the chart', async () => {
    const tab = tree.root.findByProps({
      accessibilityLabel: '1W price history',
    });
    await act(async () => tab.props.onPress());
    expect(mockOnInteract).toHaveBeenCalledTimes(1);
    expect(tab.props.accessibilityState.selected).toBe(true);
    const bars = await frame('idle', null, 0);
    expect(bars.every((bar) => bar.transform[0].scaleY === 1)).toBe(true);
  });
});

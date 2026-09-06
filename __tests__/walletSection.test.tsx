import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { WalletSection } from '../examples/shared/wallet/WalletSection';

let mockProgress = {
  progress: { value: 1 },
  phase: 'idle',
  direction: null as string | null,
};
let mockStyle: { opacity: number; transform: { translateY: number }[] };
let mockReducedMotion = false;

jest.mock('../examples/shared/runtime', () => ({
  useChoreographyProgress: () => mockProgress,
}));

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../__mocks__/react-native-reanimated'),
  __esModule: true,
  default: { View: 'AnimatedView' },
  useReducedMotion: () => mockReducedMotion,
  useAnimatedStyle: (compute: () => typeof mockStyle) => {
    mockStyle = compute();
    return mockStyle;
  },
}));

describe('Wallet companion reveal', () => {
  let tree: ReactTestRenderer;

  beforeEach(async () => {
    mockProgress = { progress: { value: 1 }, phase: 'idle', direction: null };
    mockReducedMotion = false;
    await act(async () => {
      tree = create(<WalletSection>{null}</WalletSection>);
    });
  });

  afterEach(async () => {
    await act(async () => tree.unmount());
  });

  async function renderProgress(
    phase: string,
    direction: string | null,
    value: number
  ) {
    mockProgress = { phase, direction, progress: { value } };
    await act(async () => {
      tree.update(<WalletSection>{null}</WalletSection>);
    });
    return mockStyle.opacity;
  }

  test('Back stays visible during preparation, then fades out monotonically', async () => {
    expect(await renderProgress('preparing', 'backward', 1)).toBe(1);
    expect(await renderProgress('active', 'backward', 1)).toBe(1);
    const halfway = await renderProgress('active', 'backward', 0.6);
    expect(halfway).toBeGreaterThan(0);
    expect(halfway).toBeLessThan(1);
    expect(await renderProgress('active', 'backward', 0)).toBe(0);
  });

  test('forward preparation stays hidden and settled direct entry is visible', async () => {
    expect(await renderProgress('preparing', null, 1)).toBe(0);
    expect(await renderProgress('preparing', 'forward', 1)).toBe(0);
    expect(await renderProgress('active', 'forward', 0)).toBe(0);
    expect(await renderProgress('active', 'forward', 1)).toBe(1);
    expect(await renderProgress('idle', null, 0)).toBe(1);
  });

  test('reduced motion preserves the fade without translation', async () => {
    mockReducedMotion = true;
    await renderProgress('active', 'backward', 0.6);
    expect(mockStyle.opacity).toBeLessThan(1);
    expect(mockStyle.transform).toEqual([{ translateY: 0 }]);
  });

  test('the price caption waits for the shared text and never translates', async () => {
    for (const direction of ['forward', 'backward']) {
      for (const value of [0, 0.79, 0.9, 1]) {
        mockProgress = { phase: 'active', direction, progress: { value } };
        await act(async () => {
          tree.update(
            <WalletSection start={0.8} distance={0}>
              {null}
            </WalletSection>
          );
        });
        expect(mockStyle.transform).toEqual([{ translateY: 0 }]);
        if (value < 0.8) expect(mockStyle.opacity).toBe(0);
        else if (value === 1) expect(mockStyle.opacity).toBe(1);
        else expect(mockStyle.opacity).toBeCloseTo(2 / 3);
      }
    }
  });
});

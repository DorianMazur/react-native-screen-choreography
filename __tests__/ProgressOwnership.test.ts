import { withSpring } from 'react-native-reanimated';
import {
  animateOwnedProgress,
  ProgressOwnership,
} from '../src/core/ProgressOwnership';

jest.mock('react-native-reanimated', () => ({
  cancelAnimation: jest.fn(),
  withSpring: jest.fn(() => 0.4),
}));

describe('provider progress ownership', () => {
  test('rejects stale work even before a replacement React render', () => {
    const owner = { value: 0 } as ProgressOwnership['owner'];
    const progress = { value: 0.6 } as ProgressOwnership['owner'];
    const ownership = new ProgressOwnership(owner, progress);
    ownership.setSession('A');
    const token = ownership.claim('A')!;
    ownership.setSession('B');
    expect(ownership.isCurrent(token, 'A')).toBe(false);
    expect(ownership.claim('A')).toBeNull();
    const onComplete = jest.fn();
    animateOwnedProgress({
      ownership,
      token,
      sessionId: 'A',
      progress,
      target: 0,
      spring: {},
      onComplete,
    });
    expect(progress.value).toBe(0.6);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('a delayed worklet completion cannot change replacement progress', () => {
    const owner = { value: 0 } as ProgressOwnership['owner'];
    const progress = { value: 0.6 } as ProgressOwnership['owner'];
    const ownership = new ProgressOwnership(owner, progress);
    ownership.setSession('A');
    const token = ownership.claim('A')!;
    const onComplete = jest.fn();
    animateOwnedProgress({
      ownership,
      token,
      sessionId: 'A',
      progress,
      target: 0,
      spring: {},
      onComplete,
    });
    const callback = (withSpring as jest.Mock).mock.calls.at(-1)![2];
    ownership.setSession('B');
    progress.value = 0.7;
    callback(true);
    expect(progress.value).toBe(0.7);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('same-session metric updates preserve ownership, but a new animation supersedes it', () => {
    const ownership = new ProgressOwnership(
      { value: 0 } as ProgressOwnership['owner'],
      { value: 0 } as ProgressOwnership['owner']
    );
    ownership.setSession('A');
    const token = ownership.claim('A')!;
    ownership.setSession('A');
    expect(ownership.isCurrent(token, 'A')).toBe(true);
    ownership.claim('A');
    expect(ownership.isCurrent(token, 'A')).toBe(false);
  });
});

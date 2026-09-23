import { withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  animateOwnedProgress,
  ProgressOwnership,
  setOwnedProgress,
} from './ProgressOwnership';
import { ElementVisibilityRegistry } from './ElementVisibilityRegistry';

jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('../../__mocks__/react-native-reanimated'),
  cancelAnimation: jest.fn(),
  withSpring: jest.fn(() => 0.4),
  withTiming: jest.fn(() => 0.4),
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (worklet: (...args: unknown[]) => void, ...args: unknown[]) =>
    worklet(...args),
  scheduleOnRN: jest.fn(),
}));

function flushRN() {
  const pending = [...(scheduleOnRN as jest.Mock).mock.calls];
  (scheduleOnRN as jest.Mock).mockClear();
  for (const [callback, ...args] of pending) callback(...args);
}

beforeEach(() => jest.clearAllMocks());

describe('provider progress ownership', () => {
  test.each([
    [0, undefined],
    [1, undefined],
    [0, 600],
    [1, 600],
  ])(
    'reduced motion settles to %s without animating (duration=%s)',
    (target, duration) => {
      const visibility = new ElementVisibilityRegistry();
      const element = visibility.get('element', false);
      visibility.sync(new Set(['element']), 'A');
      const progress = { value: 0.5 } as ProgressOwnership['owner'];
      const ownership = new ProgressOwnership(
        { value: 0 } as ProgressOwnership['owner'],
        progress,
        visibility.handoff,
        true
      );
      ownership.setSession('A');
      const token = ownership.claim('A')!;
      const onComplete = jest.fn();
      const onCompleteUI = jest.fn(() => expect(progress.value).toBe(target));
      const animate = () =>
        animateOwnedProgress({
          ownership,
          token,
          sessionId: 'A',
          progress,
          target: target!,
          duration,
          spring: {},
          onComplete,
          onCompleteUI,
        });
      animate();
      expect(withSpring).not.toHaveBeenCalled();
      expect(withTiming).not.toHaveBeenCalled();
      expect(progress.value).toBe(target);
      expect(element.value).toBe(0);
      expect(onCompleteUI).toHaveBeenCalledTimes(1);
      expect(onComplete).not.toHaveBeenCalled();
      flushRN();
      expect(onComplete).toHaveBeenCalledWith(token, 'A');
      expect(onComplete).toHaveBeenCalledTimes(1);

      ownership.setSession(null);
    }
  );

  test.each([0, 1])(
    'hands off endpoint %s before JS completion runs',
    (target) => {
      const visibility = new ElementVisibilityRegistry();
      const source = visibility.get('source', false);
      const destination = visibility.get('destination', false);
      const owner = { value: 0 } as ProgressOwnership['owner'];
      const progress = { value: 0.5 } as ProgressOwnership['owner'];
      const ownership = new ProgressOwnership(
        owner,
        progress,
        visibility.handoff
      );
      ownership.setSession('A');
      const token = ownership.claim('A')!;
      visibility.sync(new Set(['source', 'destination']), 'A');
      const onComplete = jest.fn();
      animateOwnedProgress({
        ownership,
        token,
        sessionId: 'A',
        progress,
        target,
        spring: {},
        onComplete,
      });
      expect(source.value).toBe(1);
      const callback = (withSpring as jest.Mock).mock.calls.at(-1)![2];
      callback(true);
      expect(source.value).toBe(0);
      expect(destination.value).toBe(0);
      expect(visibility.handoff.value.completed).toBe(true);
      expect(onComplete).not.toHaveBeenCalled();
      flushRN();
      expect(onComplete).toHaveBeenCalledWith(token, 'A');
      expect(onComplete).toHaveBeenCalledTimes(1);
    }
  );

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

  test.each(['animation', 'assignment'] as const)(
    '%s callbacks from providers with equal tokens are delivered independently and only once',
    (kind) => {
      const start = () => {
        const progress = { value: 0.5 } as ProgressOwnership['owner'];
        const ownership = new ProgressOwnership(
          { value: 0 } as ProgressOwnership['owner'],
          progress
        );
        ownership.setSession('same-session');
        const token = ownership.claim('same-session')!;
        const onComplete = jest.fn();
        if (kind === 'animation') {
          animateOwnedProgress({
            ownership,
            token,
            sessionId: 'same-session',
            progress,
            target: 1,
            spring: {},
            onComplete,
          });
          (withSpring as jest.Mock).mock.calls.at(-1)![2](true);
        } else {
          setOwnedProgress(
            ownership,
            token,
            'same-session',
            progress,
            1,
            onComplete
          );
        }
        return { ownership, token, onComplete };
      };
      const first = start();
      const second = start();
      expect(first.token).toBe(second.token);
      const pending = [...(scheduleOnRN as jest.Mock).mock.calls];
      flushRN();
      pending.forEach(([callback, ...args]) => callback(...args));
      expect(first.onComplete).toHaveBeenCalledTimes(1);
      expect(second.onComplete).toHaveBeenCalledTimes(1);
      expect(first.onComplete).toHaveBeenCalledWith(
        first.token,
        'same-session'
      );
      expect(second.onComplete).toHaveBeenCalledWith(
        second.token,
        'same-session'
      );
    }
  );

  test('invalidating one provider rejects its queued completion without cancelling another provider', () => {
    const start = (sessionId: string) => {
      const progress = { value: 0.5 } as ProgressOwnership['owner'];
      const ownership = new ProgressOwnership(
        { value: 0 } as ProgressOwnership['owner'],
        progress
      );
      ownership.setSession(sessionId);
      const token = ownership.claim(sessionId)!;
      const onComplete = jest.fn();
      setOwnedProgress(ownership, token, sessionId, progress, 1, onComplete);
      return { ownership, token, onComplete };
    };
    const first = start('A');
    const second = start('B');
    first.ownership.invalidate();
    flushRN();
    expect(first.onComplete).not.toHaveBeenCalled();
    expect(second.onComplete).toHaveBeenCalledWith(second.token, 'B');
  });
});

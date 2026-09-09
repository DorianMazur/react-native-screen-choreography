import { makeMutable } from 'react-native-reanimated';
import type { VisibilityHandoff } from './ElementVisibilityRegistry';
import {
  updateReverseHandoff,
  type ReverseHandoffState,
} from './ReverseTransitionHandoff';

jest.mock('react-native-worklets', () => ({}));

function createHandoff() {
  const sourceHidden = makeMutable(1);
  const targetHidden = makeMutable(1);
  const visibility = makeMutable<VisibilityHandoff>({
    sessionId: 'reverse',
    elements: [sourceHidden, targetHidden],
    completed: false,
  });
  const owner = makeMutable(7);
  const interactionOwner = makeMutable<string | null>(null);
  const gate = makeMutable<ReverseHandoffState | null>({
    sessionId: 'reverse',
    token: 7,
    targetScreenId: 'home',
    animationFinished: false,
    navigationPresented: false,
    completed: false,
  });
  return {
    gate,
    owner,
    visibility,
    sourceHidden,
    targetHidden,
    interactionOwner,
    signal(
      signal: 'animationFinished' | 'navigationPresented',
      sessionId = 'reverse',
      token = 7
    ) {
      updateReverseHandoff(
        gate,
        owner,
        visibility,
        interactionOwner,
        sessionId,
        token,
        signal
      );
    },
  };
}

describe('reverse UI handoff gate', () => {
  test.each(['animationFinished', 'navigationPresented'] as const)(
    'hands off visibility and input together when %s arrives first',
    (first) => {
      const handoff = createHandoff();
      const second =
        first === 'animationFinished'
          ? 'navigationPresented'
          : 'animationFinished';
      handoff.signal(first);
      handoff.signal(first);
      expect(handoff.gate.value?.[first]).toBe(true);
      expect(handoff.gate.value?.[second]).toBe(false);
      expect(handoff.gate.value?.completed).toBe(false);
      expect(handoff.sourceHidden.value).toBe(1);
      expect(handoff.targetHidden.value).toBe(1);
      expect(handoff.visibility.value.completed).toBe(false);
      expect(handoff.interactionOwner.value).toBeNull();

      handoff.signal(second);
      expect(handoff.gate.value?.completed).toBe(true);
      expect(handoff.sourceHidden.value).toBe(0);
      expect(handoff.targetHidden.value).toBe(0);
      expect(handoff.visibility.value.completed).toBe(true);
      expect(handoff.interactionOwner.value).toBe('home');
    }
  );

  test('does not repeat handoff or overwrite input ownership on duplicate signals', () => {
    const handoff = createHandoff();
    handoff.signal('animationFinished');
    handoff.signal('navigationPresented');
    const completed = handoff.gate.value;
    const completedVisibility = handoff.visibility.value;
    handoff.interactionOwner.value = 'another-screen';
    handoff.signal('animationFinished');
    handoff.signal('navigationPresented');
    expect(handoff.gate.value).toBe(completed);
    expect(handoff.visibility.value).toBe(completedVisibility);
    expect(handoff.interactionOwner.value).toBe('another-screen');
  });

  test.each([
    ['stale session', 'previous-session', 7],
    ['stale token', 'reverse', 6],
    ['future token', 'reverse', 8],
  ] as const)('ignores a %s signal', (_reason, sessionId, token) => {
    const handoff = createHandoff();
    handoff.signal('navigationPresented');
    const waiting = handoff.gate.value;
    handoff.signal('animationFinished', sessionId, token);
    expect(handoff.gate.value).toBe(waiting);
    expect(handoff.sourceHidden.value).toBe(1);
    expect(handoff.targetHidden.value).toBe(1);
    expect(handoff.interactionOwner.value).toBeNull();
  });

  test.each(['animationFinished', 'navigationPresented'] as const)(
    'ignores late %s after progress ownership is superseded',
    (last) => {
      const handoff = createHandoff();
      handoff.signal(
        last === 'animationFinished'
          ? 'navigationPresented'
          : 'animationFinished'
      );
      const waiting = handoff.gate.value;
      handoff.owner.value = 8;
      handoff.signal(last);
      expect(handoff.gate.value).toBe(waiting);
      expect(handoff.visibility.value.completed).toBe(false);
      expect(handoff.interactionOwner.value).toBeNull();
    }
  );

  test('a cleared gate cannot be reopened by pending animation or native events', () => {
    const handoff = createHandoff();
    handoff.signal('navigationPresented');
    handoff.gate.value = null;
    handoff.signal('animationFinished');
    handoff.signal('navigationPresented');
    expect(handoff.gate.value).toBeNull();
    expect(handoff.sourceHidden.value).toBe(1);
    expect(handoff.targetHidden.value).toBe(1);
    expect(handoff.interactionOwner.value).toBeNull();
  });

  test('an old session cannot complete a replacement gate that already has one signal', () => {
    const handoff = createHandoff();
    handoff.gate.value = {
      ...handoff.gate.value!,
      sessionId: 'replacement',
      navigationPresented: true,
    };
    const replacement = handoff.gate.value;
    handoff.signal('animationFinished');
    expect(handoff.gate.value).toBe(replacement);
    expect(handoff.interactionOwner.value).toBeNull();
    expect(handoff.visibility.value.completed).toBe(false);
  });
});

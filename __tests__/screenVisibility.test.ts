import {
  deriveScreenOpacity,
  getScreenRole,
  getSessionPhase,
  shouldBlockInteraction,
} from '../src/screenVisibility';
import type { TransitionSessionData } from '../src/types';

function makeSession(
  overrides: Partial<TransitionSessionData> = {}
): TransitionSessionData {
  return {
    id: 'session_1',
    groupId: 'g',
    sourceScreenId: 'List',
    targetScreenId: 'Detail',
    state: 'active',
    pairs: [],
    progress: { value: 0 } as any,
    direction: 'forward',
    ...overrides,
  };
}

describe('getScreenRole', () => {
  it('returns inactive when there is no session', () => {
    expect(getScreenRole(null, 'List')).toBe('inactive');
  });

  it('returns source for the source screen', () => {
    expect(getScreenRole(makeSession(), 'List')).toBe('source');
  });

  it('returns target for the target screen', () => {
    expect(getScreenRole(makeSession(), 'Detail')).toBe('target');
  });

  it('returns inactive for unrelated screens', () => {
    expect(getScreenRole(makeSession(), 'Other')).toBe('inactive');
  });
});

describe('getSessionPhase', () => {
  it('returns idle when nothing is happening', () => {
    expect(getSessionPhase(null, null, 'List')).toBe('idle');
  });

  it('returns preparing when this screen is the pending target', () => {
    expect(getSessionPhase(null, 'Detail', 'Detail')).toBe('preparing');
  });

  it('returns preparing while the session is measuring', () => {
    expect(
      getSessionPhase(makeSession({ state: 'measuring' }), null, 'List')
    ).toBe('preparing');
  });

  it('returns active when the session is active', () => {
    expect(getSessionPhase(makeSession(), null, 'List')).toBe('active');
  });

  it('returns completing / cancelling for terminal states', () => {
    expect(
      getSessionPhase(makeSession({ state: 'completing' }), null, 'List')
    ).toBe('completing');
    expect(
      getSessionPhase(makeSession({ state: 'cancelling' }), null, 'List')
    ).toBe('cancelling');
  });
});

describe('deriveScreenOpacity', () => {
  it('keeps inactive screens fully visible', () => {
    expect(deriveScreenOpacity('forward', 'inactive', 'active', 0.5)).toBe(1);
    expect(deriveScreenOpacity('backward', 'inactive', 'active', 0.5)).toBe(1);
  });

  it('keeps screens fully visible during idle / completing / cancelling', () => {
    expect(deriveScreenOpacity('forward', 'source', 'idle', 0)).toBe(1);
    expect(deriveScreenOpacity('forward', 'source', 'completing', 0.7)).toBe(1);
    expect(deriveScreenOpacity('backward', 'target', 'cancelling', 0.3)).toBe(
      1
    );
  });

  it('hides the future target during preparing phase', () => {
    expect(deriveScreenOpacity('forward', 'target', 'preparing', 0)).toBe(0);
    expect(deriveScreenOpacity('backward', 'target', 'preparing', 1)).toBe(0);
  });

  it('does not touch the source during preparing phase', () => {
    expect(deriveScreenOpacity('forward', 'source', 'preparing', 0)).toBe(1);
    expect(deriveScreenOpacity('backward', 'source', 'preparing', 1)).toBe(1);
  });

  describe('forward direction, active phase', () => {
    it('reveals the target at progress > 0.001', () => {
      expect(deriveScreenOpacity('forward', 'target', 'active', 0)).toBe(0);
      expect(deriveScreenOpacity('forward', 'target', 'active', 0.0005)).toBe(
        0
      );
      expect(deriveScreenOpacity('forward', 'target', 'active', 0.01)).toBe(1);
      expect(deriveScreenOpacity('forward', 'target', 'active', 1)).toBe(1);
    });

    it('fades the source out over progress [0, 0.4]', () => {
      expect(deriveScreenOpacity('forward', 'source', 'active', 0)).toBe(1);
      expect(
        deriveScreenOpacity('forward', 'source', 'active', 0.2)
      ).toBeCloseTo(0.5);
      expect(deriveScreenOpacity('forward', 'source', 'active', 0.4)).toBe(0);
      expect(deriveScreenOpacity('forward', 'source', 'active', 1)).toBe(0);
    });
  });

  describe('backward direction, active phase', () => {
    it('reveals the target (the screen we are returning to) immediately', () => {
      // For backward, t = 1 - progress. progress starts near 1 and decreases.
      // The target is fully visible the entire animation.
      expect(deriveScreenOpacity('backward', 'target', 'active', 1)).toBe(0);
      expect(deriveScreenOpacity('backward', 'target', 'active', 0.99)).toBe(1);
      expect(deriveScreenOpacity('backward', 'target', 'active', 0.5)).toBe(1);
      expect(deriveScreenOpacity('backward', 'target', 'active', 0)).toBe(1);
    });

    it('fades the source (the screen we are leaving) symmetrically', () => {
      // t = 1 - progress. Source fade kicks in over t ∈ [0, 0.4],
      // i.e. progress ∈ [0.6, 1.0]. progress=1 → t=0 → fully visible.
      // progress=0.6 → t=0.4 → invisible. progress=0.5 → t=0.5 → invisible.
      expect(deriveScreenOpacity('backward', 'source', 'active', 1)).toBe(1);
      expect(
        deriveScreenOpacity('backward', 'source', 'active', 0.8)
      ).toBeCloseTo(0.5);
      expect(deriveScreenOpacity('backward', 'source', 'active', 0.6)).toBe(0);
      expect(deriveScreenOpacity('backward', 'source', 'active', 0)).toBe(0);
    });
  });
});

describe('shouldBlockInteraction', () => {
  it('never blocks inactive screens', () => {
    expect(shouldBlockInteraction('inactive', 'active')).toBe(false);
    expect(shouldBlockInteraction('inactive', 'preparing')).toBe(false);
  });

  it('blocks participating screens during preparing or active', () => {
    expect(shouldBlockInteraction('source', 'preparing')).toBe(true);
    expect(shouldBlockInteraction('source', 'active')).toBe(true);
    expect(shouldBlockInteraction('target', 'preparing')).toBe(true);
    expect(shouldBlockInteraction('target', 'active')).toBe(true);
  });

  it('does not block once the session is winding down', () => {
    expect(shouldBlockInteraction('source', 'completing')).toBe(false);
    expect(shouldBlockInteraction('target', 'cancelling')).toBe(false);
    expect(shouldBlockInteraction('source', 'idle')).toBe(false);
  });
});

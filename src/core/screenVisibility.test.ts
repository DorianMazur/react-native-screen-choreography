import {
  deriveScreenOpacity,
  getScreenRole,
  getSessionPhase,
  shouldBlockInteraction,
} from './screenVisibility';
import type { TransitionSessionData } from '../types';

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
    // Backward direction: the target screen is already mounted underneath
    // and must stay visible during the ~150ms session-prep window to avoid
    // a black flash before the overlay activates.
    expect(deriveScreenOpacity('backward', 'target', 'preparing', 1)).toBe(1);
  });

  it('does not touch the source during preparing phase', () => {
    expect(deriveScreenOpacity('forward', 'source', 'preparing', 0)).toBe(1);
    expect(deriveScreenOpacity('backward', 'source', 'preparing', 1)).toBe(1);
  });

  describe('forward direction, active phase', () => {
    it('reveals the expanded target over progress [0, 0.4]', () => {
      expect(deriveScreenOpacity('forward', 'target', 'active', 0)).toBe(0);
      expect(
        deriveScreenOpacity('forward', 'target', 'active', 0.2)
      ).toBeCloseTo(0.5);
      expect(deriveScreenOpacity('forward', 'target', 'active', 0.4)).toBe(1);
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
    it('reveals the collapsed target as expansion returns from 0.4 to 0', () => {
      expect(deriveScreenOpacity('backward', 'target', 'active', 1)).toBe(0);
      expect(deriveScreenOpacity('backward', 'target', 'active', 0.4)).toBe(0);
      expect(
        deriveScreenOpacity('backward', 'target', 'active', 0.2)
      ).toBeCloseTo(0.5);
      expect(deriveScreenOpacity('backward', 'target', 'active', 0)).toBe(1);
    });

    it('keeps the expanded source opaque until companion content has faded', () => {
      expect(deriveScreenOpacity('backward', 'source', 'active', 1)).toBe(1);
      expect(deriveScreenOpacity('backward', 'source', 'active', 0.8)).toBe(1);
      expect(deriveScreenOpacity('backward', 'source', 'active', 0.7)).toBe(1);
      expect(deriveScreenOpacity('backward', 'source', 'active', 0.4)).toBe(1);
      expect(
        deriveScreenOpacity('backward', 'source', 'active', 0.2)
      ).toBeCloseTo(0.5);
      expect(deriveScreenOpacity('backward', 'source', 'active', 0)).toBe(0);
    });
  });

  it('uses identical opacity for each physical screen in either direction', () => {
    for (const progress of [-0.1, 0, 0.001, 0.1, 0.2, 0.4, 0.7, 0.9, 1, 1.1]) {
      const collapsed = deriveScreenOpacity(
        'forward',
        'source',
        'active',
        progress
      );
      const expanded = deriveScreenOpacity(
        'forward',
        'target',
        'active',
        progress
      );
      expect(
        deriveScreenOpacity('backward', 'target', 'active', progress)
      ).toBe(collapsed);
      expect(
        deriveScreenOpacity('backward', 'source', 'active', progress)
      ).toBe(expanded);
      expect(collapsed + expanded).toBeCloseTo(1);
      expect(expanded).toBeGreaterThanOrEqual(0);
      expect(expanded).toBeLessThanOrEqual(1);
    }
  });

  it('reversing an in-flight gesture retraces the same screen opacity', () => {
    const values = [1, 0.85, 0.7, 0.4, 0.2, 0.1];
    const closing = values.map((value) =>
      deriveScreenOpacity('backward', 'source', 'active', value)
    );
    const reopening = [...values]
      .reverse()
      .map((value) =>
        deriveScreenOpacity('forward', 'target', 'active', value)
      );
    expect(reopening).toEqual(closing.reverse());
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

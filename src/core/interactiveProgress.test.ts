import {
  resolveInteractiveTransitionOutcome,
  toInteractiveSessionProgress,
} from './interactiveProgress';

describe('interactive progress', () => {
  it('clamps gesture progress and maps it to session progress', () => {
    expect(toInteractiveSessionProgress(-1)).toBe(1);
    expect(toInteractiveSessionProgress(0.25)).toBe(0.75);
    expect(toInteractiveSessionProgress(2)).toBe(0);
  });

  it('finishes after the threshold and cancels before it', () => {
    expect(resolveInteractiveTransitionOutcome({ progress: 0.5 })).toBe(
      'finish'
    );
    expect(resolveInteractiveTransitionOutcome({ progress: 0.49 })).toBe(
      'cancel'
    );
  });

  it('projects release velocity before choosing an endpoint', () => {
    expect(
      resolveInteractiveTransitionOutcome({ progress: 0.4, velocity: 0.6 })
    ).toBe('finish');
    expect(
      resolveInteractiveTransitionOutcome({ progress: 0.6, velocity: -0.6 })
    ).toBe('cancel');
  });

  it('accepts custom threshold and velocity impact', () => {
    expect(
      resolveInteractiveTransitionOutcome({
        progress: 0.3,
        velocity: 1,
        threshold: 0.7,
        velocityImpact: 0.5,
      })
    ).toBe('finish');
  });
});

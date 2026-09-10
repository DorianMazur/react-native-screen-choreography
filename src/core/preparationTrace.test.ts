import type { ChoreographyPreparationTrace } from '../types';
import { PreparationTrace } from './preparationTrace';

const identity = {
  groupId: 'photo:one',
  sourceScreenId: 'list',
  targetScreenId: 'detail',
  direction: 'forward' as const,
};

describe('PreparationTrace', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('buffers nested spans on one clock and delivers once after completion', () => {
    let now = 100;
    const observer = jest.fn();
    const trace = new PreparationTrace(identity, observer, () => now);
    const endCoordinator = trace.start('coordinator');
    now = 105;
    const endRead = trace.start('target-measure');
    now = 110;
    const details = { reads: 1 };
    endRead(details);
    details.reads = 500;
    now = 120;
    endCoordinator();
    endCoordinator();
    trace.setSession('session:one', 'detail:instance');
    now = 140;
    trace.finish('overlay-ready');
    trace.finish('cancelled');
    expect(observer).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    expect(observer).toHaveBeenCalledTimes(1);
    const report: ChoreographyPreparationTrace = observer.mock.calls[0]![0];
    expect(report).toMatchObject({
      ...identity,
      targetScreenId: 'detail:instance',
      sessionId: 'session:one',
      startedAtMs: 100,
      completedAtMs: 140,
      clock: 'js-performance-now',
      outcome: 'overlay-ready',
      droppedStages: 0,
      stages: [
        {
          name: 'coordinator',
          startedAtMs: 100,
          durationMs: 20,
          completed: true,
        },
        {
          name: 'target-measure',
          startedAtMs: 105,
          durationMs: 5,
          completed: true,
          details: { reads: 1 },
        },
      ],
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.stages)).toBe(true);
    expect(Object.isFrozen(report.stages[0])).toBe(true);
  });

  test('closes interrupted work without claiming the stage completed', () => {
    let now = 10;
    const observer = jest.fn();
    const trace = new PreparationTrace(identity, observer, () => now);
    const endRead = trace.start('source-measure');
    now = 25;
    trace.finish('cancelled');
    now = 100;
    endRead();
    trace.start('late-stage')();
    trace.setSession('late-session');
    jest.runOnlyPendingTimers();

    expect(observer.mock.calls[0]![0]).toMatchObject({
      sessionId: null,
      completedAtMs: 25,
      outcome: 'cancelled',
      stages: [{ name: 'source-measure', durationMs: 15, completed: false }],
    });
  });

  test('observer failure cannot throw into navigation', async () => {
    const trace = new PreparationTrace(identity, () => {
      throw new Error('observer failed');
    });
    trace.finish('failed');
    await expect(jest.runOnlyPendingTimersAsync()).resolves.toBeUndefined();
  });

  test('bounds trace storage and exposes lost stages', () => {
    const observer = jest.fn();
    const trace = new PreparationTrace(identity, observer, () => 10);
    for (let index = 0; index < 1100; index += 1) trace.start('sample')();
    trace.finish('overlay-ready');
    jest.runOnlyPendingTimers();
    expect(observer.mock.calls[0]![0].stages).toHaveLength(1024);
    expect(observer.mock.calls[0]![0].droppedStages).toBe(76);
  });
});

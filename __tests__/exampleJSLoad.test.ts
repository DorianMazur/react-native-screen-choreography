import { createJSLoadController } from '../examples/shared/performance/jsThreadLoad';

describe('example JS stress controls', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Advance within the busy loop without stalling the test runner.
    let busyClock = 0;
    jest
      .spyOn(performance, 'now')
      .mockImplementation(() => jest.now() + busyClock++);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each(['heavy', 'superHeavy'] as const)(
    'bounds %s load and stops scheduling after its deadline',
    (intensity) => {
      const load = createJSLoadController();
      load.pulse(intensity);
      jest.advanceTimersByTime(30_100);
      expect(load.getSnapshot().phase).toBe('idle');
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  it('replaces pending work and cancels on stop', () => {
    const load = createJSLoadController();
    load.pulse('heavy');
    load.pulse('superHeavy');
    expect(jest.getTimerCount()).toBe(1);
    expect(load.getSnapshot().label).toBe('Super heavy JS load · 30 s');
    load.stop();
    const reads = jest.mocked(performance.now).mock.calls.length;
    jest.advanceTimersByTime(31_000);
    expect(performance.now).toHaveBeenCalledTimes(reads);
    expect(load.getSnapshot().phase).toBe('idle');
  });

  it('cancels work and subscriptions on unmount', () => {
    const load = createJSLoadController();
    const listener = jest.fn();
    load.subscribe(listener);
    load.pulse('superHeavy');
    load.dispose();
    jest.advanceTimersByTime(31_000);
    expect(jest.getTimerCount()).toBe(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

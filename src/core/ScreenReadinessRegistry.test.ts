import { ScreenReadinessRegistry } from './ScreenReadinessRegistry';

describe('ScreenReadinessRegistry', () => {
  it('waits for layout readiness and all blockers', async () => {
    const registry = new ScreenReadinessRegistry();
    const releaseFirst = registry.acquire('Detail');
    const releaseSecond = registry.acquire('Detail');
    let resolved = false;
    const waiting = registry.waitForReady('Detail', 1000).then((ready) => {
      resolved = true;
      return ready;
    });

    registry.setReady('Detail', true);
    releaseFirst();
    await Promise.resolve();
    expect(resolved).toBe(false);

    releaseSecond();
    await expect(waiting).resolves.toBe(true);
  });

  it('makes blocker releases idempotent', () => {
    const registry = new ScreenReadinessRegistry();
    const release = registry.acquire('Detail');
    release();
    release();
    expect(registry.getBlockerCount('Detail')).toBe(0);
  });

  it('reports a readiness timeout without discarding blockers', async () => {
    jest.useFakeTimers();
    const registry = new ScreenReadinessRegistry();
    registry.setReady('Detail', true);
    registry.acquire('Detail');
    const waiting = registry.waitForReady('Detail', 700);

    jest.advanceTimersByTime(700);
    await expect(waiting).resolves.toBe(false);
    expect(registry.getBlockerCount('Detail')).toBe(1);
    jest.useRealTimers();
  });

  it('settles pending readiness as false when the screen unregisters', async () => {
    const registry = new ScreenReadinessRegistry();
    let result: boolean | undefined;
    const waiting = registry.waitForReady('Detail', 1000);
    waiting.then((ready) => {
      result = ready;
    });

    registry.unregister('Detail');
    await Promise.resolve();

    expect(result).toBe(false);
    await expect(waiting).resolves.toBe(false);
  });

  it('settles all pending readiness waits as false on disposal', async () => {
    const registry = new ScreenReadinessRegistry();
    const first = registry.waitForReady('First', 1000);
    const second = registry.waitForReady('Second', 1000);

    registry.dispose();

    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
  });
});

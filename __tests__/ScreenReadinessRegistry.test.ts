import { ScreenReadinessRegistry } from '../src/core/ScreenReadinessRegistry';

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
});

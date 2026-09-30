export type LoadSnapshot = {
  phase: 'idle' | 'running';
  label: string;
};

const now = () =>
  (
    globalThis as typeof globalThis & { performance: { now(): number } }
  ).performance.now();

function blockJS(durationMs: number) {
  const end = now() + durationMs;
  while (now() < end) {
    // Intentional bounded busy loop; timers or promises would yield instead.
  }
}

export function createJSLoadController() {
  let snapshot: LoadSnapshot = { phase: 'idle', label: 'JS load off' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: LoadSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const cancel = () => {
    generation++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const stop = () => {
    cancel();
    publish({ phase: 'idle', label: 'JS load off' });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    stop,
    dispose: () => {
      cancel();
      snapshot = { phase: 'idle', label: 'JS load off' };
      listeners.clear();
    },
    pulse: (intensity: 'heavy' | 'superHeavy') => {
      cancel();
      const token = generation;
      const busyMs = intensity === 'superHeavy' ? 500 : 80;
      const yieldMs = 20;
      const end = now() + 30_000;
      publish({
        phase: 'running',
        label: `${intensity === 'superHeavy' ? 'Super heavy' : 'Heavy'} JS load · 30 s`,
      });
      const tick = () => {
        if (token !== generation) return;
        const remaining = end - now();
        if (remaining <= 0) return stop();
        blockJS(Math.min(busyMs, remaining));
        timer = setTimeout(tick, yieldMs);
      };
      // Let the menu close before generating load.
      timer = setTimeout(tick, 300);
    },
  };
}

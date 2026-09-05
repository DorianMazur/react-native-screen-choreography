interface ScreenReadinessState {
  ready: boolean;
  blockers: Set<symbol>;
  waiters: Set<(ready: boolean) => void>;
}

export class ScreenReadinessRegistry {
  private screens = new Map<string, ScreenReadinessState>();

  private getState(screenId: string): ScreenReadinessState {
    let state = this.screens.get(screenId);
    if (!state) {
      state = { ready: false, blockers: new Set(), waiters: new Set() };
      this.screens.set(screenId, state);
    }
    return state;
  }

  private canStart(state: ScreenReadinessState): boolean {
    return state.ready && state.blockers.size === 0;
  }

  private settleWaiters(state: ScreenReadinessState, ready: boolean): void {
    const waiters = [...state.waiters];
    state.waiters.clear();
    waiters.forEach((resolve) => resolve(ready));
  }

  private resolveIfReady(state: ScreenReadinessState): void {
    if (!this.canStart(state)) {
      return;
    }

    this.settleWaiters(state, true);
  }

  setReady(screenId: string, ready: boolean): void {
    const state = this.getState(screenId);
    state.ready = ready;
    this.resolveIfReady(state);
  }

  unregister(screenId: string): void {
    const state = this.screens.get(screenId);
    if (!state) {
      return;
    }
    state.ready = false;
    this.settleWaiters(state, false);
    this.screens.delete(screenId);
  }

  acquire(screenId: string): () => void {
    const state = this.getState(screenId);
    const token = Symbol(screenId);
    state.blockers.add(token);
    let released = false;

    return () => {
      if (released) {
        return;
      }
      released = true;
      state.blockers.delete(token);
      this.resolveIfReady(state);
    };
  }

  isReady(screenId: string): boolean {
    return this.canStart(this.getState(screenId));
  }

  getBlockerCount(screenId: string): number {
    return this.getState(screenId).blockers.size;
  }

  waitForReady(screenId: string, timeoutMs: number): Promise<boolean> {
    const state = this.getState(screenId);
    if (this.canStart(state)) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ready: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        state.waiters.delete(onReady);
        resolve(ready);
      };
      const onReady = (ready: boolean) => finish(ready);
      const timeoutId = setTimeout(() => finish(false), timeoutMs);
      state.waiters.add(onReady);
    });
  }

  dispose(): void {
    for (const state of this.screens.values()) {
      this.settleWaiters(state, false);
    }
    this.screens.clear();
  }
}

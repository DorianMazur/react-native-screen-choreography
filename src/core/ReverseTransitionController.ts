export interface ReverseNavigationResult {
  removed: boolean;
  presented: boolean;
}

export interface ReverseTransitionConfig {
  sessionId: string;
  sourceScreenId: string;
  targetScreenId: string;
  commitNavigation: () => Promise<ReverseNavigationResult>;
  animate: (onFinished: () => void) => void;
  handoff: () => void;
  cancel: () => void;
  isCurrent: () => boolean;
}

interface ReverseOperation {
  config: ReverseTransitionConfig;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  navigationStarted: boolean;
  sourceUnmounted: boolean;
  animationFinished: boolean;
  navigationResult: ReverseNavigationResult | null;
  finished: boolean;
}

export class ReverseTransitionController {
  private operation: ReverseOperation | null = null;

  owns(sessionId: string): boolean {
    return this.operation?.config.sessionId === sessionId;
  }

  expectsSourceUnmount(sessionId: string, screenId: string): boolean {
    const operation = this.operation;
    return Boolean(
      operation?.config.sessionId === sessionId &&
      operation.config.sourceScreenId === screenId &&
      operation.navigationStarted
    );
  }

  noteSourceUnmount(sessionId: string, screenId: string): boolean {
    if (!this.expectsSourceUnmount(sessionId, screenId)) return false;
    this.operation!.sourceUnmounted = true;
    return true;
  }

  start(config: ReverseTransitionConfig): Promise<void> {
    if (this.operation?.config.sessionId === config.sessionId) {
      return this.operation.promise;
    }
    if (this.operation) this.finish(this.operation, 'abandon');
    if (!config.isCurrent()) return Promise.resolve();

    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const operation: ReverseOperation = {
      config,
      promise,
      resolve,
      reject,
      navigationStarted: false,
      sourceUnmounted: false,
      animationFinished: false,
      navigationResult: null,
      finished: false,
    };
    this.operation = operation;
    this.prepare(operation);
    return promise;
  }

  cancelBeforeCommit(sessionId: string): boolean {
    const operation = this.operation;
    if (
      !operation ||
      operation.config.sessionId !== sessionId ||
      operation.navigationStarted ||
      !this.isCurrent(operation)
    ) {
      return false;
    }
    this.finish(operation, 'cancel');
    return true;
  }

  dispose(): void {
    if (this.operation) this.finish(this.operation, 'abandon');
  }

  private isCurrent(operation: ReverseOperation): boolean {
    if (this.operation !== operation || operation.finished) return false;
    if (operation.config.isCurrent()) return true;
    this.finish(operation, 'abandon');
    return false;
  }

  private prepare(operation: ReverseOperation): void {
    if (!this.isCurrent(operation)) return;

    try {
      operation.config.animate(() => {
        if (!this.isCurrent(operation) || operation.animationFinished) return;
        operation.animationFinished = true;
        if (!operation.navigationStarted) this.commit(operation);
        this.completeIfReady(operation);
      });
    } catch {
      this.finish(operation, 'cancel');
      return;
    }

  }

  private async commit(operation: ReverseOperation): Promise<void> {
    if (!this.isCurrent(operation) || operation.navigationStarted) return;
    operation.navigationStarted = true;
    try {
      operation.navigationResult = await operation.config.commitNavigation();
    } catch {
      operation.navigationResult = {
        removed: operation.sourceUnmounted,
        presented: false,
      };
    }
    if (!this.isCurrent(operation)) return;

    if (operation.sourceUnmounted) operation.navigationResult.removed = true;
    if (!operation.navigationResult.removed) {
      this.finish(operation, 'cancel');
      return;
    }
    this.completeIfReady(operation);
  }

  private completeIfReady(operation: ReverseOperation): void {
    if (
      this.isCurrent(operation) &&
      operation.animationFinished &&
      operation.navigationResult?.removed
    ) {
      this.finish(operation, 'handoff');
    }
  }

  private finish(
    operation: ReverseOperation,
    outcome: 'handoff' | 'cancel' | 'abandon'
  ): void {
    if (operation.finished) return;
    operation.finished = true;
    try {
      if (outcome === 'handoff') operation.config.handoff();
      if (outcome === 'cancel') operation.config.cancel();
    } catch (error) {
      operation.reject(error);
    } finally {
      if (this.operation === operation) this.operation = null;
      operation.resolve();
    }
  }
}

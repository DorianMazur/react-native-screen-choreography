import type { ChoreographyNavigationEvent } from '../types';
import { debugLog } from '../debug/logger';

type EventDetails = ChoreographyNavigationEvent extends infer Event
  ? Event extends ChoreographyNavigationEvent
    ? Omit<
        Event,
        'requestId' | 'sourceScreenId' | 'targetScreenId' | 'sessionId'
      >
    : never
  : never;

let nextRequestId = 0;

/** Observation only: the controller still owns navigation and session lifetime. */
export class NavigationRequestObserver {
  readonly id = `navigation-${++nextRequestId}`;
  sessionId: string | null = null;
  finished = false;
  private status: ChoreographyNavigationEvent['status'] | null = null;

  constructor(
    readonly sourceScreenId: string,
    public targetScreenId: string,
    private listener:
      | ((event: ChoreographyNavigationEvent) => void)
      | undefined,
    private onFinish: () => void
  ) {}

  emit(details: EventDetails): void {
    if (this.finished || this.status === details.status) return;
    this.status = details.status;
    this.finished = details.finished;
    const listener = this.listener;
    if (this.finished) {
      this.listener = undefined;
      this.onFinish();
    }
    const event = {
      requestId: this.id,
      sourceScreenId: this.sourceScreenId,
      targetScreenId: this.targetScreenId,
      sessionId: this.sessionId,
      ...details,
    } as ChoreographyNavigationEvent;
    // Deliver after the controller/provider finish their atomic bookkeeping.
    // A listener may itself navigate, including after receiving completion.
    queueMicrotask(() => {
      try {
        listener?.(event);
      } catch (error) {
        // An observer must not strand locks or change the navigation outcome.
        debugLog(`[Navigation] observer failed: ${String(error)}`);
      }
    });
  }
}

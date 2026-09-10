import type {
  ChoreographyPreparationStage,
  ChoreographyPreparationTrace,
} from '../types';

type TraceIdentity = Pick<
  ChoreographyPreparationTrace,
  'groupId' | 'sourceScreenId' | 'targetScreenId' | 'direction'
>;
type StageDetails = ChoreographyPreparationStage['details'];
const MAX_STAGES = 1024;
let traceCounter = 0;

export class PreparationTrace {
  private readonly traceId = `preparation_${++traceCounter}`;
  private readonly startedAtMs: number;
  private sessionId: string | null = null;
  private targetScreenId: string;
  private stages: ChoreographyPreparationStage[] = [];
  private pending = new Map<symbol, { name: string; startedAtMs: number }>();
  private finished = false;
  private droppedStages = 0;

  constructor(
    private readonly identity: TraceIdentity,
    private readonly onTrace: (trace: ChoreographyPreparationTrace) => void,
    private readonly now: () => number = () =>
      (
        globalThis as typeof globalThis & { performance: { now(): number } }
      ).performance.now()
  ) {
    this.startedAtMs = now();
    this.targetScreenId = identity.targetScreenId;
  }

  setSession(sessionId: string, targetScreenId?: string): void {
    if (this.finished) return;
    this.sessionId = sessionId;
    if (targetScreenId) this.targetScreenId = targetScreenId;
  }

  start(name: string): (details?: StageDetails) => void {
    if (this.finished) return () => {};
    if (this.stages.length + this.pending.size >= MAX_STAGES) {
      this.droppedStages += 1;
      return () => {};
    }
    const token = Symbol(name);
    this.pending.set(token, { name, startedAtMs: this.now() });
    return (details) => {
      const stage = this.pending.get(token);
      if (!stage || this.finished) return;
      this.pending.delete(token);
      this.stages.push({
        ...stage,
        durationMs: this.now() - stage.startedAtMs,
        completed: true,
        ...(details ? { details: Object.freeze({ ...details }) } : {}),
      });
    };
  }

  finish(outcome: ChoreographyPreparationTrace['outcome']): void {
    if (this.finished) return;
    const completedAtMs = this.now();
    this.finished = true;
    for (const stage of this.pending.values()) {
      this.stages.push({
        ...stage,
        durationMs: completedAtMs - stage.startedAtMs,
        completed: false,
      });
    }
    this.pending.clear();
    const report: ChoreographyPreparationTrace = Object.freeze({
      ...this.identity,
      traceId: this.traceId,
      sessionId: this.sessionId,
      targetScreenId: this.targetScreenId,
      clock: 'js-performance-now',
      startedAtMs: this.startedAtMs,
      completedAtMs,
      outcome,
      stages: Object.freeze(
        this.stages
          .sort((a, b) => a.startedAtMs - b.startedAtMs)
          .map((stage) => Object.freeze(stage))
      ),
      droppedStages: this.droppedStages,
    });
    // Deliver after the preparation promise has resumed its caller and allowed
    // animation dispatch. Observer work and failures cannot block that path.
    setTimeout(() => {
      try {
        Promise.resolve(this.onTrace(report)).catch(() => {});
      } catch {
        // Diagnostics must never alter navigation success or cancellation.
      }
    }, 0);
  }
}

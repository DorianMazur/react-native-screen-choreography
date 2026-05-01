import { makeMutable, type SharedValue } from 'react-native-reanimated';
import { Platform } from 'react-native';
import type {
  TransitionSessionData,
  ElementTransitionPair,
  TransitionState,
  RegisteredElement,
} from './types';
import type { ElementRegistry } from './ElementRegistry';
import { measureElementsBatched, type BatchMeasureEntry } from './measurement';
import { debugLog } from './debug/logger';

let sessionCounter = 0;

function nowMs(): number {
  return Date.now();
}

function elapsedMs(startedAt: number): string {
  return `${Date.now() - startedAt}ms`;
}

export class TransitionCoordinator {
  private registry: ElementRegistry;
  private activeSession: TransitionSessionData | null = null;
  private progress: SharedValue<number>;
  private debug = false;
  private onSessionChange: (session: TransitionSessionData | null) => void =
    () => {};
  private hiddenElements = new Set<string>();

  constructor(registry: ElementRegistry, progress: SharedValue<number>) {
    this.registry = registry;
    this.progress = progress;
  }

  setDebug(enabled: boolean) {
    this.debug = enabled;
    this.registry.setDebug(enabled);
  }

  setOnSessionChange(cb: (session: TransitionSessionData | null) => void) {
    this.onSessionChange = cb;
  }

  getActiveSession(): TransitionSessionData | null {
    return this.activeSession;
  }

  getHiddenElements(): Set<string> {
    return this.hiddenElements;
  }

  async preMeasureGroup(groupId: string, screenId: string): Promise<void> {
    const preMeasureStartedAt = nowMs();
    const elementIds = this.registry.getGroupElementIds(groupId);

    if (this.debug) {
      debugLog(
        `[Coordinator] Pre-measuring ${elementIds.length} elements in group "${groupId}" on screen "${screenId}"`
      );
    }

    const elements = elementIds
      .map((id) => this.registry.getByIdAndScreen(id, screenId))
      .filter((element): element is NonNullable<typeof element> => !!element);

    const batchEntries: BatchMeasureEntry[] = elements.map((element) => ({
      id: element.id,
      ref: element.ref,
      animatedRef: element.animatedRef,
    }));

    const results = await measureElementsBatched(batchEntries);

    for (const element of elements) {
      const metrics = results.get(element.id) ?? null;
      if (metrics) {
        this.registry.updateMetrics(element.id, screenId, metrics);
      }
    }

    if (this.debug) {
      debugLog(
        `[Coordinator] Pre-measure complete group="${groupId}" screen="${screenId}" duration=${elapsedMs(preMeasureStartedAt)}`
      );
    }
  }

  async refreshActiveSessionMetrics(side: 'source' | 'target'): Promise<void> {
    const session = this.activeSession;
    if (!session || session.state !== 'active' || session.pairs.length === 0) {
      return;
    }

    const refreshStartedAt = nowMs();
    const batchEntries: BatchMeasureEntry[] = session.pairs.map((pair) => {
      const element = side === 'source' ? pair.source : pair.target;
      return {
        id: pair.id,
        ref: element.ref,
        animatedRef: element.animatedRef,
      };
    });

    const results = await measureElementsBatched(batchEntries);

    if (!this.activeSession || this.activeSession.id !== session.id) {
      return;
    }

    let updatedCount = 0;
    const nextPairs = this.activeSession.pairs.map((pair) => {
      const element = side === 'source' ? pair.source : pair.target;
      const nextMetrics = results.get(pair.id) ?? null;

      if (!nextMetrics) {
        return pair;
      }

      const previousMetrics =
        side === 'source' ? pair.sourceMetrics : pair.targetMetrics;

      this.registry.updateMetrics(pair.id, element.screenId, nextMetrics);

      if (this.metricsAreClose(previousMetrics, nextMetrics)) {
        return pair;
      }

      updatedCount += 1;

      return side === 'source'
        ? { ...pair, sourceMetrics: nextMetrics }
        : { ...pair, targetMetrics: nextMetrics };
    });

    if (updatedCount === 0) {
      if (this.debug) {
        debugLog(
          `[Coordinator] Active ${side} metrics unchanged session="${session.id}" duration=${elapsedMs(refreshStartedAt)}`
        );
      }
      return;
    }

    if (this.debug) {
      debugLog(
        `[Coordinator] Refreshed active ${side} metrics session="${session.id}" count=${updatedCount}/${session.pairs.length} duration=${elapsedMs(refreshStartedAt)}`
      );
    }

    this.updateSession({
      ...this.activeSession,
      pairs: nextPairs,
    });
  }

  private async waitForTargets(
    elementIds: string[],
    targetScreenId: string,
    expectedIds?: string[]
  ): Promise<void> {
    const waitStartedAt = nowMs();
    const deadline = Date.now() + 500;
    const requiredIds = expectedIds?.length ? expectedIds : elementIds;

    while (Date.now() < deadline) {
      const readyIds = requiredIds.filter(
        (id) => !!this.registry.getByIdAndScreen(id, targetScreenId)
      );

      if (readyIds.length > 0 && readyIds.length === requiredIds.length) {
        if (this.debug) {
          debugLog(
            `[Coordinator] Target elements ready screen="${targetScreenId}" count=${readyIds.length}/${requiredIds.length} duration=${elapsedMs(waitStartedAt)}`
          );
        }
        return;
      }

      if (!expectedIds?.length && readyIds.length > 0) {
        if (this.debug) {
          debugLog(
            `[Coordinator] Partial target availability screen="${targetScreenId}" count=${readyIds.length}/${requiredIds.length} duration=${elapsedMs(waitStartedAt)}`
          );
        }
        return;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 16));
    }

    if (this.debug) {
      debugLog(
        `[Coordinator] Timed out waiting for target elements on screen "${targetScreenId}" duration=${elapsedMs(waitStartedAt)}`
      );
    }
  }

  private metricsAreClose(
    first: { pageX: number; pageY: number; width: number; height: number },
    second: { pageX: number; pageY: number; width: number; height: number }
  ): boolean {
    const epsilon = 0.5;

    return (
      Math.abs(first.pageX - second.pageX) <= epsilon &&
      Math.abs(first.pageY - second.pageY) <= epsilon &&
      Math.abs(first.width - second.width) <= epsilon &&
      Math.abs(first.height - second.height) <= epsilon
    );
  }

  private async waitForStableTargetMeasurements(
    targetScreenId: string,
    candidateIds: string[],
    options?: {
      extendedStability?: boolean;
    }
  ): Promise<void> {
    const waitStartedAt = nowMs();
    const deadline = Date.now() + 500;
    const requireExtendedStability = options?.extendedStability ?? false;
    const requiredStableReads =
      Platform.OS === 'android' && requireExtendedStability ? 4 : 2;
    let previousMeasurements = new Map<
      string,
      {
        pageX: number;
        pageY: number;
        width: number;
        height: number;
      }
    >();
    let stableReads = 0;

    while (Date.now() < deadline) {
      const measurableIds = candidateIds.filter(
        (id) => !!this.registry.getByIdAndScreen(id, targetScreenId)
      );

      if (measurableIds.length === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 16));
        continue;
      }

      const measurableElements = measurableIds
        .map((id) => this.registry.getByIdAndScreen(id, targetScreenId))
        .filter((element): element is NonNullable<typeof element> => !!element);

      const batchEntries: BatchMeasureEntry[] = measurableElements.map(
        (element) => ({
          id: element.id,
          ref: element.ref,
          animatedRef: element.animatedRef,
        })
      );

      const batchResults = await measureElementsBatched(batchEntries);

      const measurements: (readonly [
        string,
        import('./types').ElementMetrics | null,
      ])[] = measurableIds.map(
        (id) => [id, batchResults.get(id) ?? null] as const
      );

      const currentMeasurements = new Map<
        string,
        {
          pageX: number;
          pageY: number;
          width: number;
          height: number;
        }
      >();
      let allMeasured = true;

      for (const [id, metrics] of measurements) {
        if (!metrics) {
          allMeasured = false;
          break;
        }

        currentMeasurements.set(id, metrics);
        this.registry.updateMetrics(id, targetScreenId, metrics);
      }

      if (!allMeasured) {
        stableReads = 0;
        previousMeasurements = currentMeasurements;
        await new Promise<void>((resolve) => setTimeout(resolve, 16));
        continue;
      }

      const unchanged =
        currentMeasurements.size === previousMeasurements.size &&
        Array.from(currentMeasurements.entries()).every(([id, metrics]) => {
          const previous = previousMeasurements.get(id);
          return previous ? this.metricsAreClose(previous, metrics) : false;
        });

      if (unchanged) {
        stableReads += 1;
        if (stableReads >= requiredStableReads) {
          if (this.debug) {
            debugLog(
              `[Coordinator] Stable target measurements ready screen="${targetScreenId}" ids=${currentMeasurements.size} reads=${stableReads}/${requiredStableReads} duration=${elapsedMs(waitStartedAt)}`
            );
          }
          return;
        }
      } else {
        stableReads = 0;
      }

      previousMeasurements = currentMeasurements;
      await new Promise<void>((resolve) => setTimeout(resolve, 16));
    }

    if (this.debug) {
      debugLog(
        `[Coordinator] Timed out waiting for stable target measurements on screen "${targetScreenId}" duration=${elapsedMs(waitStartedAt)}`
      );
    }
  }

  async startTransition(config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward' | 'backward';
  }): Promise<TransitionSessionData | null> {
    const transitionStartedAt = nowMs();
    const { groupId, sourceScreenId, targetScreenId, direction } = config;

    if (this.activeSession) {
      this.cancelTransition();
    }

    const sessionId = `session_${++sessionCounter}`;

    if (this.debug) {
      debugLog(
        `[Coordinator] Starting transition "${sessionId}" group="${groupId}" ${sourceScreenId} → ${targetScreenId}`
      );
    }

    this.updateSession({
      id: sessionId,
      groupId,
      sourceScreenId,
      targetScreenId,
      state: 'measuring',
      pairs: [],
      progress: this.progress,
      direction,
    });

    const elementIds = this.registry.getGroupElementIds(groupId);

    if (this.debug) {
      debugLog(
        `[Coordinator] Found ${elementIds.length} element IDs in group "${groupId}"`
      );
    }

    await this.waitForTargets(elementIds, targetScreenId, elementIds);
    await this.waitForStableTargetMeasurements(targetScreenId, elementIds, {
      extendedStability: direction === 'forward',
    });

    const pairingStartedAt = nowMs();

    const shouldRemeasureSource = direction === 'backward';
    const shouldRemeasureTarget = direction === 'forward';

    const pairingCandidates: {
      id: string;
      source: RegisteredElement;
      target: RegisteredElement;
    }[] = [];
    const batchEntries: BatchMeasureEntry[] = [];

    for (const id of elementIds) {
      const source = this.registry.getByIdAndScreen(id, sourceScreenId);
      const target = this.registry.getByIdAndScreen(id, targetScreenId);

      if (!source || !target) {
        if (this.debug) {
          debugLog(
            `[Coordinator] Skipping "${id}" — source: ${!!source}, target: ${!!target}`
          );
        }
        continue;
      }

      pairingCandidates.push({ id, source, target });

      if (shouldRemeasureSource || !source.metrics) {
        batchEntries.push({
          id: `source:${id}`,
          ref: source.ref,
          animatedRef: source.animatedRef,
        });
      }
      if (shouldRemeasureTarget || !target.metrics) {
        batchEntries.push({
          id: `target:${id}`,
          ref: target.ref,
          animatedRef: target.animatedRef,
        });
      }
    }

    const batchResults =
      batchEntries.length > 0
        ? await measureElementsBatched(batchEntries)
        : new Map<string, import('./types').ElementMetrics | null>();

    const pairs: ElementTransitionPair[] = [];

    for (const { id, source, target } of pairingCandidates) {
      const transition = source.transition ?? target.transition;
      const sourceMetrics = batchResults.get(`source:${id}`) ?? source.metrics;
      const targetMetrics = batchResults.get(`target:${id}`) ?? target.metrics;

      if (!sourceMetrics || !targetMetrics || !transition) {
        if (this.debug) {
          debugLog(
            `[Coordinator] Skipping "${id}" — sourceMetrics=${!!sourceMetrics} targetMetrics=${!!targetMetrics} transition=${!!transition}`
          );
        }
        continue;
      }

      this.registry.updateMetrics(id, sourceScreenId, sourceMetrics);
      this.registry.updateMetrics(id, targetScreenId, targetMetrics);

      pairs.push({
        id,
        source,
        target,
        sourceMetrics,
        targetMetrics,
        transition,
      });
    }

    if (pairs.length === 0) {
      if (this.debug) {
        debugLog(
          `[Coordinator] No valid pairs found, aborting transition "${sessionId}" after ${elapsedMs(transitionStartedAt)}`
        );
      }
      this.updateSession(null);
      return null;
    }

    if (this.debug) {
      debugLog(
        `[Coordinator] Pairing complete session="${sessionId}" count=${pairs.length}/${elementIds.length} duration=${elapsedMs(pairingStartedAt)}`
      );
      debugLog(
        `[Coordinator] Transition "${sessionId}" active with ${pairs.length} pairs totalPrep=${elapsedMs(transitionStartedAt)}`
      );
    }

    for (const pair of pairs) {
      this.hiddenElements.add(`${pair.id}:${pair.source.screenId}`);
      this.hiddenElements.add(`${pair.id}:${pair.target.screenId}`);
    }

    this.progress.value = direction === 'forward' ? 0 : 1;

    this.updateSession({
      id: sessionId,
      groupId,
      sourceScreenId,
      targetScreenId,
      state: 'active',
      pairs,
      progress: this.progress,
      direction,
    });

    return this.activeSession;
  }

  completeTransition(): void {
    if (!this.activeSession) return;

    if (this.debug) {
      debugLog(
        `[Coordinator] Completing transition "${this.activeSession.id}"`
      );
    }

    this.updateSessionState('completing');

    this.hiddenElements.clear();

    this.updateSession(null);
  }

  cancelTransition(): void {
    if (!this.activeSession) return;

    if (this.debug) {
      debugLog(
        `[Coordinator] Cancelling transition "${this.activeSession.id}"`
      );
    }

    this.updateSessionState('cancelling');

    this.hiddenElements.clear();

    this.progress.value = this.activeSession.direction === 'forward' ? 0 : 1;

    this.updateSession(null);
  }

  private updateSession(session: TransitionSessionData | null) {
    this.activeSession = session;
    this.onSessionChange(session);
  }

  private updateSessionState(state: TransitionState) {
    if (this.activeSession) {
      this.activeSession = { ...this.activeSession, state };
    }
  }
}

export function createProgressValue(): SharedValue<number> {
  return makeMutable(0);
}

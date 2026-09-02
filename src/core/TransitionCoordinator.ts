import { type SharedValue } from 'react-native-reanimated';
import { Platform } from 'react-native';
import type {
  TransitionSessionData,
  ElementTransitionPair,
  TransitionState,
  RegisteredElement,
  ElementBitmap,
} from '../types';
import type { ElementRegistry } from './ElementRegistry';
import { measureElementsBatched, type BatchMeasureEntry } from './measurement';
import { captureElementBitmap, releaseElementBitmap } from './snapshotCapture';
import { debugLog, debugTrace, debugWarn } from '../debug/logger';
import { getElementIdentityKey } from './elementIdentity';

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
  private onSessionChange: (session: TransitionSessionData | null) => void =
    () => {};
  private hiddenElements = new Set<string>();
  /**
   * Last known-good target metrics keyed by `${screenId}:${id}`. Lets
   * repeated opens of the same target layout validate with one batched
   * measurement instead of running the stable-measurement loop.
   */
  private targetMetricsCache = new Map<
    string,
    { pageX: number; pageY: number; width: number; height: number }
  >();
  /**
   * Source bitmaps captured during `preMeasureGroup` (while the source is
   * still mounted and visible), keyed by `${screenId}:${id}` and consumed
   * when the session pairs are built.
   */
  private pendingSourceBitmaps = new Map<string, ElementBitmap>();

  constructor(registry: ElementRegistry, progress: SharedValue<number>) {
    this.registry = registry;
    this.progress = progress;
  }

  private elementKey(screenId: string, groupId: string, id: string): string {
    return getElementIdentityKey(screenId, groupId, id);
  }

  setDebug(enabled: boolean) {
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
    const elementIds = this.registry.getGroupElementIds(groupId, screenId);

    debugTrace(
      `[Coordinator] Pre-measuring ${elementIds.length} elements in group "${groupId}" on screen "${screenId}"`
    );

    const elements = elementIds
      .map((id) => this.registry.getByIdAndScreen(id, screenId, groupId))
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
        this.registry.updateMetrics(element.id, screenId, metrics, groupId);
      }
    }

    // Capture source bitmaps for opt-in elements while they are still
    // mounted and visible — native-stack may detach them after navigation.
    await Promise.all(
      elements.map(async (element) => {
        if (element.getSnapshot().snapshotMode !== 'bitmap') {
          return;
        }

        const key = this.elementKey(screenId, groupId, element.id);
        const previous = this.pendingSourceBitmaps.get(key);
        if (previous) {
          this.pendingSourceBitmaps.delete(key);
          releaseElementBitmap(previous);
        }

        const bitmap = await captureElementBitmap(element.ref);
        if (bitmap) {
          this.pendingSourceBitmaps.set(key, bitmap);
          debugTrace(
            `[Coordinator] Captured source bitmap id="${element.id}" screen="${screenId}"`
          );
        }
      })
    );

    debugTrace(
      `[Coordinator] Pre-measure complete group="${groupId}" screen="${screenId}" duration=${elapsedMs(preMeasureStartedAt)}`
    );
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

      this.registry.updateMetrics(
        pair.id,
        element.screenId,
        nextMetrics,
        session.groupId
      );

      if (this.metricsAreClose(previousMetrics, nextMetrics)) {
        return pair;
      }

      updatedCount += 1;

      return side === 'source'
        ? { ...pair, sourceMetrics: nextMetrics }
        : { ...pair, targetMetrics: nextMetrics };
    });

    if (updatedCount === 0) {
      debugTrace(
        `[Coordinator] Active ${side} metrics unchanged session="${session.id}" duration=${elapsedMs(refreshStartedAt)}`
      );
      return;
    }

    debugLog(
      `[Coordinator] Refreshed active ${side} metrics session="${session.id}" count=${updatedCount}/${session.pairs.length} duration=${elapsedMs(refreshStartedAt)}`
    );

    this.updateSession({
      ...this.activeSession,
      pairs: nextPairs,
    });
  }

  private waitForTargets(
    elementIds: string[],
    targetScreenId: string,
    groupId: string,
    expectedIds?: string[]
  ): Promise<void> {
    const waitStartedAt = nowMs();
    const requiredIds = expectedIds?.length ? expectedIds : elementIds;
    const requireAll = Boolean(expectedIds?.length);

    const countReady = () =>
      requiredIds.filter(
        (id) => !!this.registry.getByIdAndScreen(id, targetScreenId, groupId)
      ).length;

    const isSatisfied = () => {
      const readyCount = countReady();
      if (readyCount > 0 && readyCount === requiredIds.length) {
        return true;
      }
      return !requireAll && readyCount > 0;
    };

    if (isSatisfied()) {
      debugTrace(
        `[Coordinator] Target elements ready screen="${targetScreenId}" count=${countReady()}/${requiredIds.length} duration=${elapsedMs(waitStartedAt)}`
      );
      return Promise.resolve();
    }

    // Event-driven: resolve as soon as the registry mutation that satisfies
    // the predicate lands, instead of polling on a 16ms timer.
    return new Promise<void>((resolve) => {
      let settled = false;

      const settle = (timedOut: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        unsubscribe();
        clearTimeout(timeoutId);

        if (timedOut) {
          debugWarn(
            `[Coordinator] Timed out waiting for target elements on screen "${targetScreenId}" ready=${countReady()}/${requiredIds.length} duration=${elapsedMs(waitStartedAt)}`
          );
        } else {
          debugTrace(
            `[Coordinator] Target elements ready screen="${targetScreenId}" count=${countReady()}/${requiredIds.length} duration=${elapsedMs(waitStartedAt)}`
          );
        }

        resolve();
      };

      const unsubscribe = this.registry.subscribe(() => {
        if (isSatisfied()) {
          settle(false);
        }
      });

      const timeoutId = setTimeout(() => settle(true), 500);
    });
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

  /**
   * Hot path for repeated opens: when every candidate has a cached metric
   * from a previous session on the same target screen, run one batched
   * measurement and accept immediately if it matches the cache. Returns
   * `true` when the cache validated and the stability loop can be skipped.
   */
  private async tryCachedTargetMeasurements(
    targetScreenId: string,
    groupId: string,
    candidateIds: string[]
  ): Promise<boolean> {
    if (candidateIds.length === 0) {
      return false;
    }

    const validateStartedAt = nowMs();
    const elements: NonNullable<
      ReturnType<ElementRegistry['getByIdAndScreen']>
    >[] = [];

    for (const id of candidateIds) {
      if (
        !this.targetMetricsCache.has(
          this.elementKey(targetScreenId, groupId, id)
        )
      ) {
        return false;
      }

      const element = this.registry.getByIdAndScreen(
        id,
        targetScreenId,
        groupId
      );
      if (!element) {
        return false;
      }
      elements.push(element);
    }

    const results = await measureElementsBatched(
      elements.map((element) => ({
        id: element.id,
        ref: element.ref,
        animatedRef: element.animatedRef,
      }))
    );

    for (const id of candidateIds) {
      const cached = this.targetMetricsCache.get(
        this.elementKey(targetScreenId, groupId, id)
      )!;
      const measured = results.get(id);

      if (!measured || !this.metricsAreClose(cached, measured)) {
        debugTrace(
          `[Coordinator] Cached target metrics stale screen="${targetScreenId}" id="${id}" duration=${elapsedMs(validateStartedAt)}`
        );
        return false;
      }
    }

    for (const id of candidateIds) {
      const measured = results.get(id)!;
      this.registry.updateMetrics(id, targetScreenId, measured, groupId);
    }

    debugTrace(
      `[Coordinator] Cached target metrics validated screen="${targetScreenId}" ids=${candidateIds.length} duration=${elapsedMs(validateStartedAt)}`
    );
    return true;
  }

  private async waitForStableTargetMeasurements(
    targetScreenId: string,
    groupId: string,
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

    if (
      await this.tryCachedTargetMeasurements(
        targetScreenId,
        groupId,
        candidateIds
      )
    ) {
      return;
    }

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
        (id) => !!this.registry.getByIdAndScreen(id, targetScreenId, groupId)
      );

      if (measurableIds.length === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 16));
        continue;
      }

      const measurableElements = measurableIds
        .map((id) =>
          this.registry.getByIdAndScreen(id, targetScreenId, groupId)
        )
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
        import('../types').ElementMetrics | null,
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
        this.registry.updateMetrics(id, targetScreenId, metrics, groupId);
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
          debugTrace(
            `[Coordinator] Stable target measurements ready screen="${targetScreenId}" ids=${currentMeasurements.size} reads=${stableReads}/${requiredStableReads} duration=${elapsedMs(waitStartedAt)}`
          );
          return;
        }
      } else {
        stableReads = 0;
      }

      previousMeasurements = currentMeasurements;
      await new Promise<void>((resolve) => setTimeout(resolve, 16));
    }

    debugWarn(
      `[Coordinator] Timed out waiting for stable target measurements on screen "${targetScreenId}" duration=${elapsedMs(waitStartedAt)}`
    );
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

    debugLog(
      `[Coordinator] Starting transition "${sessionId}" group="${groupId}" ${sourceScreenId} → ${targetScreenId}`
    );

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

    const elementIds = this.registry.getGroupElementIds(
      groupId,
      sourceScreenId
    );

    debugTrace(
      `[Coordinator] Found ${elementIds.length} element IDs in group "${groupId}"`
    );

    await this.waitForTargets(elementIds, targetScreenId, groupId, elementIds);
    await this.waitForStableTargetMeasurements(
      targetScreenId,
      groupId,
      elementIds,
      {
        extendedStability: direction === 'forward',
      }
    );

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
      const source = this.registry.getByIdAndScreen(
        id,
        sourceScreenId,
        groupId
      );
      const target = this.registry.getByIdAndScreen(
        id,
        targetScreenId,
        groupId
      );

      if (!source || !target) {
        debugWarn(
          `[Coordinator] Skipping "${id}" — source: ${!!source}, target: ${!!target}`
        );
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
        : new Map<string, import('../types').ElementMetrics | null>();

    const pairs: ElementTransitionPair[] = [];

    for (const { id, source, target } of pairingCandidates) {
      const sourceSnapshot = source.getSnapshot();
      const targetSnapshot = target.getSnapshot();
      const transition = sourceSnapshot.transition ?? targetSnapshot.transition;
      const sourceMetrics = batchResults.get(`source:${id}`) ?? source.metrics;
      const targetMetrics = batchResults.get(`target:${id}`) ?? target.metrics;

      if (!sourceMetrics || !targetMetrics || !transition) {
        debugWarn(
          `[Coordinator] Skipping "${id}" — sourceMetrics=${!!sourceMetrics} targetMetrics=${!!targetMetrics} transition=${!!transition}`
        );
        continue;
      }

      this.registry.updateMetrics(id, sourceScreenId, sourceMetrics, groupId);
      this.registry.updateMetrics(id, targetScreenId, targetMetrics, groupId);

      pairs.push({
        id,
        source,
        target,
        sourceMetrics,
        targetMetrics,
        transition,
        sourceSnapshot,
        targetSnapshot,
      });
    }

    if (pairs.length === 0) {
      debugWarn(
        `[Coordinator] No valid pairs found, aborting transition "${sessionId}" after ${elapsedMs(transitionStartedAt)}`
      );
      this.releasePendingSourceBitmaps(sourceScreenId, groupId, elementIds);
      this.updateSession(null);
      return null;
    }

    await this.attachPairBitmaps(pairs, sourceScreenId, groupId);
    this.releasePendingSourceBitmaps(sourceScreenId, groupId, elementIds);

    debugLog(
      `[Coordinator] Transition "${sessionId}" active pairs=${pairs.length}/${elementIds.length} pairing=${elapsedMs(pairingStartedAt)} totalPrep=${elapsedMs(transitionStartedAt)}`
    );

    for (const pair of pairs) {
      this.hiddenElements.add(
        getElementIdentityKey(
          pair.source.screenId,
          pair.source.groupId,
          pair.id
        )
      );
      this.hiddenElements.add(
        getElementIdentityKey(
          pair.target.screenId,
          pair.target.groupId,
          pair.id
        )
      );
    }

    if (this.targetMetricsCache.size > 200) {
      this.targetMetricsCache.clear();
    }
    for (const pair of pairs) {
      this.targetMetricsCache.set(
        this.elementKey(targetScreenId, groupId, pair.id),
        pair.targetMetrics
      );
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

    debugLog(`[Coordinator] Completing transition "${this.activeSession.id}"`);

    this.updateSessionState('completing');

    this.hiddenElements.clear();

    this.releaseSessionBitmaps(this.activeSession);
    this.updateSession(null);
  }

  cancelTransition(): void {
    if (!this.activeSession) return;

    debugLog(`[Coordinator] Cancelling transition "${this.activeSession.id}"`);

    this.updateSessionState('cancelling');

    this.hiddenElements.clear();

    this.progress.value = this.activeSession.direction === 'forward' ? 0 : 1;

    this.releaseSessionBitmaps(this.activeSession);
    this.updateSession(null);
  }

  /** Attach native bitmaps to pairs whose snapshot mode requests them. */
  private async attachPairBitmaps(
    pairs: ElementTransitionPair[],
    sourceScreenId: string,
    groupId: string
  ): Promise<void> {
    const wantsBitmaps = pairs.filter(
      (pair) =>
        pair.sourceSnapshot.snapshotMode === 'bitmap' ||
        pair.targetSnapshot.snapshotMode === 'bitmap'
    );

    if (wantsBitmaps.length === 0) {
      return;
    }

    const captureStartedAt = nowMs();

    await Promise.all(
      wantsBitmaps.map(async (pair) => {
        const key = this.elementKey(sourceScreenId, groupId, pair.id);
        const pending = this.pendingSourceBitmaps.get(key);
        if (pending) {
          this.pendingSourceBitmaps.delete(key);
          pair.sourceBitmap = pending;
        } else {
          pair.sourceBitmap =
            (await captureElementBitmap(pair.source.ref)) ?? undefined;
        }

        pair.targetBitmap =
          (await captureElementBitmap(pair.target.ref)) ?? undefined;
      })
    );

    debugTrace(
      `[Coordinator] Pair bitmaps attached count=${wantsBitmaps.length} duration=${elapsedMs(captureStartedAt)}`
    );
  }

  private releasePendingSourceBitmaps(
    screenId: string,
    groupId: string,
    elementIds: string[]
  ): void {
    for (const id of elementIds) {
      const key = this.elementKey(screenId, groupId, id);
      const bitmap = this.pendingSourceBitmaps.get(key);
      if (bitmap) {
        this.pendingSourceBitmaps.delete(key);
        releaseElementBitmap(bitmap);
      }
    }
  }

  private releaseSessionBitmaps(session: TransitionSessionData | null): void {
    if (!session) return;

    for (const pair of session.pairs) {
      if (pair.sourceBitmap) {
        releaseElementBitmap(pair.sourceBitmap);
      }
      if (pair.targetBitmap) {
        releaseElementBitmap(pair.targetBitmap);
      }
    }
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

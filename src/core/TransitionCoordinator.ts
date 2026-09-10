import {
  hasNativePreparation,
  prepareNativeTargets,
  type PreparedTargets,
} from './nativePreparation';
import type { PreparationTrace } from './preparationTrace';
import { type SharedValue } from 'react-native-reanimated';
import { Platform } from 'react-native';
import type {
  TransitionSessionData,
  ElementTransitionPair,
  RegisteredElement,
  ElementMetrics,
  NodeHandleRef,
} from '../types';
import type { ElementRegistry } from './ElementRegistry';
import { measureElementsBatched, type BatchMeasureEntry } from './measurement';
import { debugLog, debugTrace, debugWarn } from '../debug/logger';
import { getElementIdentityKey } from './elementIdentity';
import {
  allowsUnpairedTransition,
  canAnimateUnpaired,
} from './unpairedElements';

let sessionCounter = 0;

function nowMs(): number {
  return Date.now();
}

function elapsedMs(startedAt: number): string {
  return `${Date.now() - startedAt}ms`;
}

function getAnimatedRef(element: RegisteredElement) {
  return element.getAnimatedRef?.() ?? element.animatedRef;
}

type ValidatedTargetMeasurements = PreparedTargets;

export class TransitionCoordinator {
  private registry: ElementRegistry;
  private activeSession: TransitionSessionData | null = null;
  private settledScreenId: string | null = null;
  private progress: SharedValue<number>;
  private operationGeneration = 0;
  private preparationCancellers = new Set<() => void>();
  private onSessionChange: (session: TransitionSessionData | null) => void =
    () => {};
  private hiddenElements = new Set<string>();
  /**
   * Last known-good metrics keyed by layout identity, group, and element. Lets
   * repeated opens of the same target layout validate with one batched
   * measurement instead of running the stable-measurement loop.
   */
  private targetMetricsCache = new Map<
    string,
    { pageX: number; pageY: number; width: number; height: number }
  >();
  constructor(
    registry: ElementRegistry,
    progress: SharedValue<number>,
    private readonly resolveLayoutId: (screenId: string) => string = (
      screenId
    ) => screenId,
    private readonly nativeReadiness?: {
      getScreenRef: (screenId: string) => NodeHandleRef | undefined;
      isScreenReady: (screenId: string) => boolean;
    }
  ) {
    this.registry = registry;
    this.progress = progress;
  }

  private elementKey(screenId: string, groupId: string, id: string): string {
    return getElementIdentityKey(this.resolveLayoutId(screenId), groupId, id);
  }

  private ownsOperation(generation: number, sessionId: string): boolean {
    return (
      this.operationGeneration === generation &&
      this.activeSession?.id === sessionId
    );
  }

  private invalidateOperations(): void {
    this.operationGeneration += 1;
    const cancellers = [...this.preparationCancellers];
    this.preparationCancellers.clear();
    cancellers.forEach((cancel) => cancel());
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

  getSettledScreenId(): string | null {
    return this.settledScreenId;
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
      animatedRef: getAnimatedRef(element),
    }));

    const results = await measureElementsBatched(batchEntries);

    for (const element of elements) {
      const metrics = results.get(element.id) ?? null;
      if (metrics) {
        this.registry.updateMetrics(element.id, screenId, metrics, groupId);
      }
    }

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
    const batchEntries: BatchMeasureEntry[] = session.pairs
      .filter((pair) =>
        side === 'source'
          ? pair.sourcePresent !== false
          : pair.targetPresent !== false
      )
      .map((pair) => {
        const element = side === 'source' ? pair.source : pair.target;
        return {
          id: pair.id,
          ref: element.ref,
          animatedRef: getAnimatedRef(element),
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
    expectedIds?: string[],
    ownsOperation: () => boolean = () => true
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
      let unsubscribe = () => {};
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const settle = (timedOut: boolean) => {
        if (settled) {
          return;
        }
        settled = true;
        this.preparationCancellers.delete(cancel);
        unsubscribe();
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }

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

      const cancel = () => settle(false);

      unsubscribe = this.registry.subscribe(() => {
        if (!ownsOperation() || isSatisfied()) {
          settle(false);
        }
      });

      timeoutId = setTimeout(() => settle(true), 500);
      this.preparationCancellers.add(cancel);
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
   * the fresh measured batch when the cache validated, so pairing can reuse it.
   */
  private async tryCachedTargetMeasurements(
    targetScreenId: string,
    groupId: string,
    candidateIds: string[],
    ownsOperation: () => boolean
  ): Promise<ValidatedTargetMeasurements | null> {
    if (candidateIds.length === 0) {
      return null;
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
        return null;
      }

      const element = this.registry.getByIdAndScreen(
        id,
        targetScreenId,
        groupId
      );
      if (!element) {
        return null;
      }
      elements.push(element);
    }

    const batchEntries = elements.map((element) => ({
      id: element.id,
      ref: element.ref,
      animatedRef: getAnimatedRef(element),
    }));
    const results = await measureElementsBatched(batchEntries);

    if (!ownsOperation()) {
      return null;
    }

    for (const id of candidateIds) {
      const cached = this.targetMetricsCache.get(
        this.elementKey(targetScreenId, groupId, id)
      )!;
      const measured = results.get(id);

      if (!measured || !this.metricsAreClose(cached, measured)) {
        debugTrace(
          `[Coordinator] Cached target metrics stale screen="${targetScreenId}" id="${id}" duration=${elapsedMs(validateStartedAt)}`
        );
        return null;
      }
    }

    const validatedMeasurements: ValidatedTargetMeasurements = new Map();
    for (const entry of batchEntries) {
      if (!ownsOperation()) {
        return null;
      }
      const metrics = results.get(entry.id)!;
      this.registry.updateMetrics(entry.id, targetScreenId, metrics, groupId);
      validatedMeasurements.set(entry.id, { ...entry, metrics });
    }

    debugTrace(
      `[Coordinator] Cached target metrics validated screen="${targetScreenId}" ids=${candidateIds.length} duration=${elapsedMs(validateStartedAt)}`
    );
    return validatedMeasurements;
  }

  private async waitForStableTargetMeasurements(
    targetScreenId: string,
    groupId: string,
    candidateIds: string[],
    options?: {
      extendedStability?: boolean;
      ownsOperation?: () => boolean;
      trace?: PreparationTrace;
    }
  ): Promise<ValidatedTargetMeasurements | null> {
    const waitStartedAt = nowMs();
    const deadline = Date.now() + 500;
    const requireExtendedStability = options?.extendedStability ?? false;
    const ownsOperation = options?.ownsOperation ?? (() => true);
    const requiredStableReads =
      Platform.OS === 'android' && requireExtendedStability ? 4 : 2;

    const endCache = options?.trace?.start('cache-validation');
    const cachedMeasurements = await this.tryCachedTargetMeasurements(
      targetScreenId,
      groupId,
      candidateIds,
      ownsOperation
    );
    endCache?.({ hit: Boolean(cachedMeasurements) });
    if (cachedMeasurements) {
      return cachedMeasurements;
    }

    if (!ownsOperation()) {
      return null;
    }

    const endStableLoop = options?.trace?.start('target-stable-loop');
    let measurementReads = 0;
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
      if (!ownsOperation()) {
        return null;
      }

      const measurableIds = candidateIds.filter(
        (id) => !!this.registry.getByIdAndScreen(id, targetScreenId, groupId)
      );

      if (measurableIds.length === 0) {
        const endFrameWait = options?.trace?.start('target-frame-wait');
        await new Promise<void>((resolve) => setTimeout(resolve, 16));
        endFrameWait?.();
        if (!ownsOperation()) {
          return null;
        }
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
          animatedRef: getAnimatedRef(element),
        })
      );

      const endMeasure = options?.trace?.start('target-measure');
      measurementReads += 1;
      const batchResults = await measureElementsBatched(batchEntries);
      endMeasure?.();

      if (!ownsOperation()) {
        return null;
      }

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
        if (!ownsOperation()) {
          return null;
        }
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
        const endFrameWait = options?.trace?.start('target-frame-wait');
        await new Promise<void>((resolve) => setTimeout(resolve, 16));
        endFrameWait?.();
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
          endStableLoop?.({ stable: true, reads: measurementReads });
          debugTrace(
            `[Coordinator] Stable target measurements ready screen="${targetScreenId}" ids=${currentMeasurements.size} reads=${stableReads}/${requiredStableReads} duration=${elapsedMs(waitStartedAt)}`
          );
          return new Map(
            batchEntries.map((entry) => [
              entry.id,
              { ...entry, metrics: currentMeasurements.get(entry.id)! },
            ])
          );
        }
      } else {
        stableReads = 0;
      }

      previousMeasurements = currentMeasurements;
      const endFrameWait = options?.trace?.start('target-frame-wait');
      await new Promise<void>((resolve) => setTimeout(resolve, 16));
      endFrameWait?.();
      if (!ownsOperation()) {
        return null;
      }
    }

    endStableLoop?.({ stable: false, reads: measurementReads });
    debugWarn(
      `[Coordinator] Timed out waiting for stable target measurements on screen "${targetScreenId}" duration=${elapsedMs(waitStartedAt)}`
    );
    // A timeout still permits best-effort pairing, but its last sample was
    // never validated. Keep the final measurement/fallback path for that case.
    return ownsOperation() ? new Map() : null;
  }

  async startTransition(config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward' | 'backward';
    onUnavailable?: (sessionId: string) => void;
    trace?: PreparationTrace;
  }): Promise<TransitionSessionData | null> {
    const transitionStartedAt = nowMs();
    const { groupId, sourceScreenId, targetScreenId, direction } = config;

    if (this.activeSession) {
      this.cancelTransition();
    }

    const sessionId = `session_${++sessionCounter}`;
    const operationGeneration = ++this.operationGeneration;
    const ownsOperation = () =>
      this.ownsOperation(operationGeneration, sessionId);

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

    const sourceIds = this.registry.getGroupElementIds(groupId, sourceScreenId);

    const requiredTargetIds = sourceIds.filter(
      (id) =>
        !canAnimateUnpaired(
          this.registry.getByIdAndScreen(id, sourceScreenId, groupId),
          'source',
          direction
        )
    );

    debugTrace(
      `[Coordinator] Found ${sourceIds.length} source element IDs in group "${groupId}"`
    );

    const endRegistration = config.trace?.start('target-registration');
    if (requiredTargetIds.length > 0)
      await this.waitForTargets(
        requiredTargetIds,
        targetScreenId,
        groupId,
        requiredTargetIds,
        ownsOperation
      );
    endRegistration?.();
    if (!ownsOperation()) {
      return null;
    }

    // Destination-only enter tracks register as the screen becomes ready.
    // Their IDs join the plan without requiring invisible source views.
    const elementIds = [
      ...new Set([
        ...sourceIds,
        ...this.registry
          .getGroupElementIds(groupId, targetScreenId)
          .filter((id) =>
            canAnimateUnpaired(
              this.registry.getByIdAndScreen(id, targetScreenId, groupId),
              'target',
              direction
            )
          ),
      ]),
    ];
    const measurableTargetIds = elementIds.filter(
      (id) => !!this.registry.getByIdAndScreen(id, targetScreenId, groupId)
    );
    let validatedTargets: ValidatedTargetMeasurements | null = null;
    const nativeForward = direction === 'forward' && hasNativePreparation();
    if (nativeForward && measurableTargetIds.length > 0) {
      const elements = measurableTargetIds.map(
        (id) => this.registry.getByIdAndScreen(id, targetScreenId, groupId)!
      );
      const entries = elements.map((element) => ({
        id: element.id,
        ref: element.ref,
        animatedRef: getAnimatedRef(element),
      }));
      const screenRef = this.nativeReadiness?.getScreenRef(targetScreenId);
      let nativeTimedOut = false;
      validatedTargets = await prepareNativeTargets({
        screenRef,
        entries,
        onTimeout: () => {
          nativeTimedOut = true;
        },
        cancellers: this.preparationCancellers,
        trace: config.trace,
        isCurrent: () =>
          ownsOperation() &&
          this.nativeReadiness?.getScreenRef(targetScreenId) === screenRef &&
          entries.every((entry) => {
            const current = this.registry.getByIdAndScreen(
              entry.id,
              targetScreenId,
              groupId
            );
            return (
              current?.ref === entry.ref &&
              getAnimatedRef(current) === entry.animatedRef
            );
          }),
      });
      if (!ownsOperation()) return null;
      if (
        nativeTimedOut ||
        (this.nativeReadiness &&
          !this.nativeReadiness.isScreenReady(targetScreenId))
      ) {
        // A deadline or new content blocker ends preparation without a second long wait.
        this.cancelTransition(sessionId);
        config.onUnavailable?.(sessionId);
        return null;
      }
      if (!validatedTargets) {
        // Restore the conservative frame gates if the native path cannot validate.
        const endFallback = config.trace?.start('native-fallback-frames');
        for (let i = 0; i < (Platform.OS === 'android' ? 3 : 2); i++) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
          );
          if (!ownsOperation()) return null;
        }
        endFallback?.();
      }
    }
    if (!validatedTargets) {
      const endStability = config.trace?.start('target-stability');
      validatedTargets =
        measurableTargetIds.length === 0
          ? new Map()
          : await this.waitForStableTargetMeasurements(
              targetScreenId,
              groupId,
              measurableTargetIds,
              {
                extendedStability: direction === 'forward',
                ownsOperation,
                trace: config.trace,
              }
            );
      endStability?.();
    }
    if (!validatedTargets || !ownsOperation()) {
      return null;
    }

    const pairingStartedAt = nowMs();
    const endPairing = config.trace?.start('pairing');

    const shouldRemeasureSource = direction === 'backward';
    const shouldRemeasureTarget = direction === 'forward';

    const pairingCandidates: {
      id: string;
      source?: RegisteredElement;
      target?: RegisteredElement;
      validatedTargetMetrics?: ElementMetrics;
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

      if (
        (!source && !canAnimateUnpaired(target, 'target', direction)) ||
        (!target && !canAnimateUnpaired(source, 'source', direction))
      ) {
        debugWarn(
          `[Coordinator] Skipping "${id}" — source: ${!!source}, target: ${!!target}`
        );
        continue;
      }

      const validatedTarget = validatedTargets.get(id);
      // A target may have been replaced while awaiting a native measurement.
      // Only reuse geometry for the same measured ref, including nested targets.
      const validatedTargetMetrics =
        target &&
        validatedTarget?.ref === target.ref &&
        validatedTarget.animatedRef === getAnimatedRef(target)
          ? validatedTarget.metrics
          : undefined;
      pairingCandidates.push({ id, source, target, validatedTargetMetrics });

      if (source && (shouldRemeasureSource || !source.metrics)) {
        batchEntries.push({
          id: `source:${id}`,
          ref: source.ref,
          animatedRef: getAnimatedRef(source),
        });
      }
      if (
        target &&
        !validatedTargetMetrics &&
        (shouldRemeasureTarget || !target.metrics)
      ) {
        batchEntries.push({
          id: `target:${id}`,
          ref: target.ref,
          animatedRef: getAnimatedRef(target),
        });
      }
    }

    const batchResults =
      batchEntries.length > 0
        ? await measureElementsBatched(batchEntries)
        : new Map<string, import('../types').ElementMetrics | null>();

    if (!ownsOperation()) {
      return null;
    }

    const pairs: ElementTransitionPair[] = [];

    for (const {
      id,
      source,
      target,
      validatedTargetMetrics,
    } of pairingCandidates) {
      if (!ownsOperation()) {
        return null;
      }
      const sourcePresentation = source?.getPresentation();
      const targetPresentation = target?.getPresentation();
      const transition =
        sourcePresentation?.transition ?? targetPresentation?.transition;
      // Props can change without re-registering while measurement is pending.
      // Only the frozen renderer's policy may authorize a virtual endpoint.
      if (
        (!source &&
          !allowsUnpairedTransition(transition, 'target', direction)) ||
        (!target && !allowsUnpairedTransition(transition, 'source', direction))
      )
        continue;
      const measuredSource =
        batchResults.get(`source:${id}`) ?? source?.metrics;
      const measuredTarget =
        validatedTargetMetrics ??
        batchResults.get(`target:${id}`) ??
        target?.metrics;
      const sourceMetrics = source ? measuredSource : measuredTarget;
      const targetMetrics = target ? measuredTarget : measuredSource;

      if (!sourceMetrics || !targetMetrics || !transition) {
        debugWarn(
          `[Coordinator] Skipping "${id}" — sourceMetrics=${!!sourceMetrics} targetMetrics=${!!targetMetrics} transition=${!!transition}`
        );
        continue;
      }

      if (source)
        this.registry.updateMetrics(id, sourceScreenId, sourceMetrics, groupId);
      if (target)
        this.registry.updateMetrics(id, targetScreenId, targetMetrics, groupId);

      // Virtual endpoints are plain session data, never registered or measured.
      const absentPresentation = { content: null, transition };
      const absentEndpoint = (screenId: string): RegisteredElement => ({
        id,
        groupId,
        screenId,
        ref: () => null,
        metrics: null,
        getPresentation: () => absentPresentation,
      });

      pairs.push({
        id,
        source: source ?? absentEndpoint(sourceScreenId),
        target: target ?? absentEndpoint(targetScreenId),
        sourceMetrics,
        targetMetrics,
        transition,
        sourcePresentation: sourcePresentation ?? absentPresentation,
        targetPresentation: targetPresentation ?? absentPresentation,
        sourcePresent: !!source,
        targetPresent: !!target,
      });
    }

    if (!ownsOperation()) {
      return null;
    }

    if (pairs.length === 0) {
      debugWarn(
        `[Coordinator] No valid pairs found, aborting transition "${sessionId}" after ${elapsedMs(transitionStartedAt)}`
      );
      try {
        config.onUnavailable?.(sessionId);
      } finally {
        if (ownsOperation()) {
          this.updateSession(null);
        }
      }
      return null;
    }

    debugLog(
      `[Coordinator] Transition "${sessionId}" active pairs=${pairs.length}/${elementIds.length} pairing=${elapsedMs(pairingStartedAt)} totalPrep=${elapsedMs(transitionStartedAt)}`
    );

    if (
      nativeForward &&
      ((this.nativeReadiness &&
        !this.nativeReadiness.isScreenReady(targetScreenId)) ||
        [
          ...new Set(
            [...validatedTargets.values()].map((target) => target.isCurrent)
          ),
        ].some((check) => check && !check()))
    ) {
      this.cancelTransition(sessionId);
      config.onUnavailable?.(sessionId);
      return null;
    }

    for (const pair of pairs) {
      // A live pair's single native view is what animates; hiding its
      // endpoint wrapper would blank the frame the view lands in.
      if (pair.transition.mode === 'live') {
        continue;
      }
      if (pair.sourcePresent !== false)
        this.hiddenElements.add(
          getElementIdentityKey(
            pair.source.screenId,
            pair.source.groupId,
            pair.id
          )
        );
      if (pair.targetPresent !== false)
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
      if (pair.targetPresent === false) continue;
      this.targetMetricsCache.set(
        this.elementKey(targetScreenId, groupId, pair.id),
        pair.targetMetrics
      );
    }

    endPairing?.();
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

  completeTransition(sessionId?: string): void {
    if (
      !this.activeSession ||
      (sessionId && this.activeSession.id !== sessionId)
    ) {
      return;
    }

    this.invalidateOperations();

    debugLog(`[Coordinator] Completing transition "${this.activeSession.id}"`);

    this.settledScreenId = this.activeSession.targetScreenId;
    this.hiddenElements.clear();
    this.updateSession(null);
  }

  cancelTransition(sessionId?: string): void {
    if (sessionId && this.activeSession?.id !== sessionId) {
      return;
    }

    this.invalidateOperations();

    if (!this.activeSession) return;

    debugLog(`[Coordinator] Cancelling transition "${this.activeSession.id}"`);

    this.settledScreenId = this.activeSession.sourceScreenId;
    this.hiddenElements.clear();
    this.progress.value = this.activeSession.direction === 'forward' ? 0 : 1;
    this.updateSession(null);
  }

  dispose(): void {
    this.invalidateOperations();
    this.hiddenElements.clear();
    this.targetMetricsCache.clear();
    this.activeSession = null;
    this.onSessionChange = () => {};
  }

  private updateSession(session: TransitionSessionData | null) {
    this.activeSession = session;
    this.onSessionChange(session);
  }
}

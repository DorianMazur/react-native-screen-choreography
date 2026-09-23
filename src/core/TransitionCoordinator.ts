import {
  captureFabricLayout,
  subscribeToFabricMounts,
  waitForFabricLayout,
  type FabricLayoutEntry,
  type FabricLayoutSnapshot,
} from './fabricLayout';
import type { PreparationTrace } from './preparationTrace';
import { type SharedValue } from 'react-native-reanimated';
import type {
  TransitionSessionData,
  ElementTransitionPair,
  RegisteredElement,
  ElementMetrics,
  NodeHandleRef,
} from '../types';
import type { ElementRegistry } from './ElementRegistry';
import { debugLog, debugTrace, debugWarn } from '../debug/logger';

let sessionCounter = 0;

function nowMs(): number {
  return Date.now();
}

function elapsedMs(startedAt: number): string {
  return `${Date.now() - startedAt}ms`;
}

type SourceCapture = {
  elements: RegisteredElement[];
  snapshot: FabricLayoutSnapshot;
};

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
  // A one-navigation source snapshot, consumed when preparation starts.
  private releaseMountSubscription: (() => void) | undefined;
  private sourceCaptureGeneration = 0;
  private sourceCaptures = new Map<string, SourceCapture>();
  constructor(
    registry: ElementRegistry,
    progress: SharedValue<number>,
    private readonly nativeReadiness?: {
      getScreenRef: (screenId: string) => NodeHandleRef | undefined;
      isScreenReady: (screenId: string) => boolean;
    }
  ) {
    this.registry = registry;
    this.progress = progress;
  }

  private sourceKey(screenId: string, groupId: string): string {
    return JSON.stringify([screenId, groupId]);
  }

  private entries(elements: RegisteredElement[]): FabricLayoutEntry[] | null {
    const result: FabricLayoutEntry[] = [];
    for (const element of elements) {
      const screenRef = this.nativeReadiness?.getScreenRef(element.screenId);
      if (!screenRef) return null;
      result.push({
        id: JSON.stringify([element.screenId, element.groupId, element.id]),
        ref: element.ref,
        screenRef,
      });
    }
    return result;
  }

  private elementsAreCurrent(elements: RegisteredElement[]): boolean {
    return elements.every(
      (element) =>
        this.registry.getByIdAndScreen(
          element.id,
          element.screenId,
          element.groupId
        )?.ref === element.ref
    );
  }

  private metricsFor(
    snapshot: FabricLayoutSnapshot,
    element: RegisteredElement
  ): ElementMetrics {
    return snapshot.metrics.get(
      JSON.stringify([element.screenId, element.groupId, element.id])
    )!;
  }

  private ownsOperation(generation: number, sessionId: string): boolean {
    return (
      this.operationGeneration === generation &&
      this.activeSession?.id === sessionId
    );
  }

  private invalidateOperations(): void {
    this.releaseMountSubscription?.();
    this.releaseMountSubscription = undefined;
    this.operationGeneration += 1;
    this.sourceCaptureGeneration += 1;
    this.sourceCaptures.clear();
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

  async captureSourceGroup(groupId: string, screenId: string): Promise<void> {
    this.sourceCaptures.clear();
    const captureGeneration = ++this.sourceCaptureGeneration;
    const generation = this.operationGeneration;
    const elements = this.registry.getGroupElements(groupId, screenId);
    const entries = this.entries(elements);
    if (!entries?.length) return;
    const snapshot = await waitForFabricLayout({
      read: () => captureFabricLayout(entries),
      isCurrent: () =>
        this.operationGeneration === generation &&
        this.sourceCaptureGeneration === captureGeneration &&
        this.elementsAreCurrent(elements),
      cancellers: this.preparationCancellers,
    });
    if (
      !snapshot ||
      !snapshot.isCurrent() ||
      this.operationGeneration !== generation ||
      this.sourceCaptureGeneration !== captureGeneration ||
      !this.elementsAreCurrent(elements)
    )
      return;
    this.sourceCaptures.set(this.sourceKey(screenId, groupId), {
      elements,
      snapshot,
    });
  }

  async refreshActiveSessionMetrics(side: 'source' | 'target'): Promise<void> {
    const session = this.activeSession;
    if (!session || session.state !== 'active' || !session.pairs.length) return;
    const elements = session.pairs.map((pair) =>
      side === 'source' ? pair.source : pair.target
    );
    const entries = this.entries(elements);
    if (!entries) return;
    await waitForFabricLayout({
      isCurrent: () =>
        this.activeSession?.id === session.id &&
        this.elementsAreCurrent(elements),
      cancellers: this.preparationCancellers,
      read: () => {
        const snapshot = captureFabricLayout(entries);
        if (!snapshot) return null;
        const currentSession = this.activeSession!;
        let changed = false;
        const pairs = currentSession.pairs.map((pair) => {
          const element = side === 'source' ? pair.source : pair.target;
          const metrics = this.metricsFor(snapshot, element);
          const previous =
            side === 'source' ? pair.sourceMetrics : pair.targetMetrics;
          if (this.metricsAreClose(previous, metrics)) return pair;
          changed = true;
          return side === 'source'
            ? { ...pair, sourceMetrics: metrics }
            : { ...pair, targetMetrics: metrics };
        });
        if (changed) this.updateSession({ ...currentSession, pairs });
        return true;
      },
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

  async startTransition(config: {
    groupId: string;
    sourceScreenId: string;
    targetScreenId: string;
    direction: 'forward' | 'backward';
    reducedMotion?: boolean;
    onUnavailable?: (sessionId: string) => void;
    trace?: PreparationTrace;
  }): Promise<TransitionSessionData | null> {
    const transitionStartedAt = nowMs();
    const { groupId, sourceScreenId, targetScreenId, direction } = config;

    const sourceCapture = this.sourceCaptures.get(
      this.sourceKey(sourceScreenId, groupId)
    );
    this.sourceCaptures.clear();
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

    const requiredTargetIds = sourceIds;

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

    const unavailable = () => {
      if (!ownsOperation()) return;
      try {
        config.onUnavailable?.(sessionId);
      } finally {
        if (ownsOperation()) this.cancelTransition(sessionId);
      }
    };
    const candidates = sourceIds.flatMap((id) => {
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
      return source && target ? [{ id, source, target }] : [];
    });
    if (!candidates.length) {
      unavailable();
      return null;
    }
    const sources = candidates.map((pair) => pair.source);
    const targets = candidates.map((pair) => pair.target);
    const canUseSourceCapture = Boolean(
      sourceCapture &&
      sourceCapture.snapshot.isCurrent() &&
      this.elementsAreCurrent(sourceCapture.elements) &&
      sources.every((source) =>
        sourceCapture.elements.some(
          (captured) => captured.id === source.id && captured.ref === source.ref
        )
      )
    );
    const endpoints = canUseSourceCapture ? targets : [...sources, ...targets];
    const entries = this.entries(endpoints);
    if (!entries) {
      unavailable();
      return null;
    }
    const isCurrent = () =>
      ownsOperation() &&
      this.elementsAreCurrent([...sources, ...targets]) &&
      (!canUseSourceCapture || sourceCapture!.snapshot.isCurrent()) &&
      Boolean(this.nativeReadiness?.isScreenReady(targetScreenId));
    const endCapture = config.trace?.start('fabric-mounted-capture');
    const session = await waitForFabricLayout({
      cancellers: this.preparationCancellers,
      isCurrent,
      read: () => {
        const snapshot = captureFabricLayout(entries);
        if (!snapshot) return null;
        const pairs: ElementTransitionPair[] = [];
        for (const { id, source, target } of candidates) {
          const sourcePresentation = source.getPresentation();
          const targetPresentation = target.getPresentation();
          const transition =
            sourcePresentation.transition ?? targetPresentation.transition;
          if (!transition) continue;
          pairs.push({
            id,
            source,
            target,
            transition,
            sourcePresentation,
            targetPresentation,
            sourceMetrics: this.metricsFor(
              canUseSourceCapture ? sourceCapture!.snapshot : snapshot,
              source
            ),
            targetMetrics: this.metricsFor(snapshot, target),
          });
        }
        // Presentation getters can trigger app updates. Retry a pending mount;
        // never activate with geometry invalidated during pairing.
        if (!isCurrent() || !snapshot.isCurrent() || !pairs.length) return null;
        const latest = captureFabricLayout(entries);
        if (
          !latest ||
          ![...snapshot.metrics].every(([id, metrics]) =>
            this.metricsAreClose(metrics, latest.metrics.get(id)!)
          )
        )
          return null;
        if (!isCurrent()) return null;
        const endpoint = direction === 'forward' ? 1 : 0;
        this.progress.value = config.reducedMotion ? endpoint : 1 - endpoint;
        const active: TransitionSessionData = {
          id: sessionId,
          groupId,
          sourceScreenId,
          targetScreenId,
          state: 'active',
          pairs,
          progress: this.progress,
          direction,
          reducedMotion: config.reducedMotion,
        };
        this.releaseMountSubscription = subscribeToFabricMounts(() => {
          const current = this.activeSession;
          if (current?.id !== sessionId || current.state !== 'active') return;
          const targetEntries = this.entries(
            current.pairs.map((pair) => pair.target)
          );
          if (!targetEntries) return;
          const updated = captureFabricLayout(targetEntries);
          if (!updated) return;
          let changed = false;
          const nextPairs = current.pairs.map((pair) => {
            const metrics = this.metricsFor(updated, pair.target);
            if (this.metricsAreClose(metrics, pair.targetMetrics)) return pair;
            changed = true;
            return { ...pair, targetMetrics: metrics };
          });
          if (changed && this.activeSession?.id === sessionId)
            this.updateSession({ ...current, pairs: nextPairs });
        });
        this.updateSession(active);
        return active;
      },
    });
    endCapture?.({ ready: Boolean(session) });
    if (!session) unavailable();
    debugTrace(
      `[Coordinator] Fabric preparation session="${sessionId}" ready=${!!session} duration=${elapsedMs(transitionStartedAt)}`
    );
    return session;
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
    this.sourceCaptures.clear();
    this.activeSession = null;
    this.onSessionChange = () => {};
  }

  private updateSession(session: TransitionSessionData | null) {
    this.activeSession = session;
    this.onSessionChange(session);
  }
}

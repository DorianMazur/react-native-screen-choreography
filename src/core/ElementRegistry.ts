import type { RegisteredElement, ElementMetrics } from '../types';
import { debugLog, debugWarn } from '../debug/logger';
import { getElementIdentityKey } from './elementIdentity';

export type RegistryListener = () => void;

export class ElementRegistry {
  private elements = new Map<string, RegisteredElement>();
  private listeners = new Set<RegistryListener>();
  private debug = false;

  setDebug(enabled: boolean) {
    this.debug = enabled;
  }

  /**
   * Subscribe to registry mutations (register / unregister / metrics
   * updates). Listeners are invoked synchronously after each mutation so
   * waiters can re-check readiness predicates without polling.
   */
  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  private key(id: string, screenId: string, groupId?: string): string {
    return getElementIdentityKey(screenId, groupId, id);
  }

  register(element: RegisteredElement): void {
    const key = this.key(element.id, element.screenId, element.groupId);
    if (this.elements.has(key)) {
      debugWarn(
        `[Registry] Replacing duplicate element id="${element.id}" group="${element.groupId ?? 'none'}" screen="${element.screenId}".`
      );
    }

    this.elements.set(key, { ...element });

    if (this.debug) {
      debugLog(
        `[Registry] Registered "${element.id}" on screen "${element.screenId}" (group: ${element.groupId ?? 'none'})`
      );
    }

    this.notifyListeners();
  }

  unregister(id: string, screenId: string, groupId: string | undefined): void {
    this.elements.delete(this.key(id, screenId, groupId));

    if (this.debug) {
      debugLog(`[Registry] Unregistered "${id}" from screen "${screenId}"`);
    }

    this.notifyListeners();
  }

  getById(id: string): RegisteredElement[] {
    return Array.from(this.elements.values()).filter(
      (element) => element.id === id
    );
  }

  getByIdAndScreen(
    id: string,
    screenId: string,
    groupId?: string
  ): RegisteredElement | undefined {
    if (groupId !== undefined) {
      return this.elements.get(this.key(id, screenId, groupId));
    }
    return this.getById(id).find((element) => element.screenId === screenId);
  }

  getGroupElements(groupId: string, screenId: string): RegisteredElement[] {
    return Array.from(this.elements.values()).filter(
      (element) => element.groupId === groupId && element.screenId === screenId
    );
  }

  getGroupElementIds(groupId: string, screenId?: string): string[] {
    const ids = new Set<string>();
    for (const element of this.elements.values()) {
      if (
        element.groupId === groupId &&
        (screenId === undefined || element.screenId === screenId)
      ) {
        ids.add(element.id);
      }
    }
    return Array.from(ids);
  }

  updateMetrics(
    id: string,
    screenId: string,
    metrics: ElementMetrics,
    groupId?: string
  ): void {
    let updated = false;
    for (const [key, element] of this.elements) {
      if (
        element.id === id &&
        element.screenId === screenId &&
        (groupId === undefined || element.groupId === groupId)
      ) {
        this.elements.set(key, { ...element, metrics });
        updated = true;
      }
    }

    if (updated) {
      this.notifyListeners();
    }
  }

  get size(): number {
    return this.elements.size;
  }

  clear(): void {
    this.elements.clear();
    this.notifyListeners();
  }

  getDebugSnapshot(): Array<{
    id: string;
    screenId: string;
    groupId: string | undefined;
    hasMetrics: boolean;
  }> {
    const snapshot: Array<{
      id: string;
      screenId: string;
      groupId: string | undefined;
      hasMetrics: boolean;
    }> = [];
    for (const element of this.elements.values()) {
      snapshot.push({
        id: element.id,
        screenId: element.screenId,
        groupId: element.groupId,
        hasMetrics: element.metrics !== null,
      });
    }
    return snapshot;
  }
}

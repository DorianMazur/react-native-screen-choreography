import type { RegisteredElement } from '../types';
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
   * Listeners are invoked synchronously after registration changes so
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

  getByIdAndScreen(
    id: string,
    screenId: string,
    groupId: string | undefined
  ): RegisteredElement | undefined {
    return this.elements.get(this.key(id, screenId, groupId));
  }

  getGroupElements(groupId: string, screenId: string): RegisteredElement[] {
    return Array.from(this.elements.values()).filter(
      (element) => element.groupId === groupId && element.screenId === screenId
    );
  }

  getGroupElementIds(groupId: string, screenId: string): string[] {
    const ids: string[] = [];
    for (const element of this.elements.values()) {
      if (element.groupId === groupId && element.screenId === screenId) {
        ids.push(element.id);
      }
    }
    return ids;
  }

  get size(): number {
    return this.elements.size;
  }

  clear(): void {
    this.elements.clear();
    this.notifyListeners();
  }
}

import type { RegisteredElement, ElementMetrics } from './types';
import { debugLog, debugWarn } from './debug/logger';

export class ElementRegistry {
  private elements = new Map<string, RegisteredElement[]>();
  private debug = false;

  setDebug(enabled: boolean) {
    this.debug = enabled;
  }

  private key(id: string): string {
    return id;
  }

  register(element: RegisteredElement): void {
    const key = this.key(element.id);
    const existing = this.elements.get(key) ?? [];

    // Warn on duplicate (groupId, id, screenId) registration. Two different
    // elements with the same id and groupId on the same screen will fight
    // for the same pair slot.
    const sameScreen = existing.find((e) => e.screenId === element.screenId);
    if (sameScreen && sameScreen.groupId !== element.groupId) {
      debugWarn(
        `[Registry] Duplicate id "${element.id}" on screen "${element.screenId}" with conflicting groupIds (existing="${sameScreen.groupId ?? 'none'}", new="${element.groupId ?? 'none'}"). Make ids unique per screen or use different groupIds.`
      );
    }

    // Warn on cross-screen collisions of (id) with different groupIds —
    // pairing matches by id within a group, so two unrelated elements
    // sharing an id but living in different groups will not pair.
    const otherGroupOnDifferentScreen = existing.find(
      (e) => e.screenId !== element.screenId && e.groupId !== element.groupId
    );
    if (otherGroupOnDifferentScreen) {
      debugWarn(
        `[Registry] Element id "${element.id}" is registered with conflicting groupIds across screens (screen "${otherGroupOnDifferentScreen.screenId}" group="${otherGroupOnDifferentScreen.groupId ?? 'none'}", screen "${element.screenId}" group="${element.groupId ?? 'none'}"). Pairing requires identical (id, groupId).`
      );
    }

    // Remove stale registration for same screen
    const filtered = existing.filter((e) => e.screenId !== element.screenId);
    filtered.push({ ...element });
    this.elements.set(key, filtered);

    if (this.debug) {
      debugLog(
        `[Registry] Registered "${element.id}" on screen "${element.screenId}" (group: ${element.groupId ?? 'none'})`
      );
    }
  }

  unregister(id: string, screenId: string): void {
    const key = this.key(id);
    const existing = this.elements.get(key);
    if (!existing) return;

    const filtered = existing.filter((e) => e.screenId !== screenId);
    if (filtered.length === 0) {
      this.elements.delete(key);
    } else {
      this.elements.set(key, filtered);
    }

    if (this.debug) {
      debugLog(`[Registry] Unregistered "${id}" from screen "${screenId}"`);
    }
  }

  getById(id: string): RegisteredElement[] {
    return this.elements.get(this.key(id)) ?? [];
  }

  getByIdAndScreen(
    id: string,
    screenId: string
  ): RegisteredElement | undefined {
    const elements = this.getById(id);
    return elements.find((e) => e.screenId === screenId);
  }

  getGroupElements(groupId: string, screenId: string): RegisteredElement[] {
    const result: RegisteredElement[] = [];
    for (const elements of this.elements.values()) {
      for (const el of elements) {
        if (el.groupId === groupId && el.screenId === screenId) {
          result.push(el);
        }
      }
    }
    return result;
  }

  getGroupElementIds(groupId: string): string[] {
    const ids = new Set<string>();
    for (const elements of this.elements.values()) {
      for (const el of elements) {
        if (el.groupId === groupId) {
          ids.add(el.id);
        }
      }
    }
    return Array.from(ids);
  }

  updateMetrics(id: string, screenId: string, metrics: ElementMetrics): void {
    const key = this.key(id);
    const existing = this.elements.get(key);
    if (!existing) {
      return;
    }

    let updated = false;
    const next = existing.map((element) => {
      if (element.screenId !== screenId) {
        return element;
      }

      updated = true;
      return { ...element, metrics };
    });

    if (updated) {
      this.elements.set(key, next);
    }
  }

  get size(): number {
    let count = 0;
    for (const elements of this.elements.values()) {
      count += elements.length;
    }
    return count;
  }

  clear(): void {
    this.elements.clear();
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
    for (const elements of this.elements.values()) {
      for (const el of elements) {
        snapshot.push({
          id: el.id,
          screenId: el.screenId,
          groupId: el.groupId,
          hasMetrics: el.metrics !== null,
        });
      }
    }
    return snapshot;
  }
}

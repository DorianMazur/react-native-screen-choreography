import { makeMutable, type SharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

interface VisibilityEntry {
  value: SharedValue<number>;
  hidden: number;
}

function applyVisibilityUpdates(updates: [SharedValue<number>, number][]) {
  'worklet';
  for (const [value, hidden] of updates) {
    value.value = hidden;
  }
}

export class ElementVisibilityRegistry {
  private entries = new Map<string, VisibilityEntry>();

  get(key: string, initiallyHidden: boolean): SharedValue<number> {
    let entry = this.entries.get(key);
    if (!entry) {
      const hidden = initiallyHidden ? 1 : 0;
      entry = { value: makeMutable(hidden), hidden };
      this.entries.set(key, entry);
    }
    return entry.value;
  }

  sync(hiddenKeys: ReadonlySet<string>): void {
    const updates: [SharedValue<number>, number][] = [];
    for (const [key, entry] of this.entries) {
      const hidden = hiddenKeys.has(key) ? 1 : 0;
      if (entry.hidden !== hidden) {
        entry.hidden = hidden;
        updates.push([entry.value, hidden]);
      }
    }
    if (updates.length > 0) {
      scheduleOnUI(applyVisibilityUpdates, updates);
    }
  }

  delete(key: string): void {
    const entry = this.entries.get(key);
    if (entry?.hidden) {
      scheduleOnUI(applyVisibilityUpdates, [[entry.value, 0]]);
    }
    this.entries.delete(key);
  }

  clear(): void {
    this.sync(new Set());
    this.entries.clear();
  }
}

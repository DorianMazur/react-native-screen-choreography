import { makeMutable, type SharedValue } from 'react-native-reanimated';
import { scheduleOnUI } from 'react-native-worklets';

interface VisibilityEntry {
  value: SharedValue<number>;
  hidden: number;
}

export interface VisibilityHandoff {
  sessionId: string | null;
  elements: SharedValue<number>[];
  completed: boolean;
}

export function finishVisibilityHandoff(
  handoff: SharedValue<VisibilityHandoff> | undefined,
  sessionId: string
) {
  'worklet';
  const state = handoff?.value;
  if (!handoff || !state || state.sessionId !== sessionId || state.completed) {
    return;
  }
  for (const element of state.elements) {
    element.value = 0;
  }
  handoff.value = { ...state, completed: true };
}

export function resumeVisibilityHandoff(
  handoff: SharedValue<VisibilityHandoff> | undefined,
  sessionId: string
) {
  'worklet';
  const state = handoff?.value;
  if (!handoff || !state || state.sessionId !== sessionId || !state.completed) {
    return;
  }
  for (const element of state.elements) {
    element.value = 1;
  }
  handoff.value = { ...state, completed: false };
}

function applyVisibilityUpdates(
  updates: [SharedValue<number>, number][],
  handoff?: SharedValue<VisibilityHandoff>,
  next?: VisibilityHandoff
) {
  'worklet';
  const previous = handoff?.value;
  for (const [value, hidden] of updates) {
    if (
      hidden === 0 &&
      previous?.completed &&
      previous.elements.includes(value)
    ) {
      continue;
    }
    value.value = hidden;
  }
  if (
    previous?.completed &&
    next?.sessionId &&
    next.sessionId !== previous.sessionId
  ) {
    for (const element of next.elements) {
      if (previous.elements.includes(element)) element.value = 1;
    }
  }
  if (handoff && next) handoff.value = next;
}

export class ElementVisibilityRegistry {
  private entries = new Map<string, VisibilityEntry>();
  private sessionId: string | null = null;
  readonly handoff = makeMutable<VisibilityHandoff>({
    sessionId: null,
    elements: [],
    completed: false,
  });

  get(key: string, initiallyHidden: boolean): SharedValue<number> {
    let entry = this.entries.get(key);
    if (!entry) {
      const hidden = initiallyHidden ? 1 : 0;
      entry = { value: makeMutable(hidden), hidden };
      this.entries.set(key, entry);
    }
    return entry.value;
  }

  sync(hiddenKeys: ReadonlySet<string>, sessionId: string | null = null): void {
    const updates: [SharedValue<number>, number][] = [];
    for (const [key, entry] of this.entries) {
      const hidden = hiddenKeys.has(key) ? 1 : 0;
      if (entry.hidden !== hidden) {
        entry.hidden = hidden;
        updates.push([entry.value, hidden]);
      }
    }
    if (updates.length > 0 || this.sessionId !== sessionId) {
      this.sessionId = sessionId;
      const elements = [...this.entries.values()]
        .filter((entry) => entry.hidden)
        .map((entry) => entry.value);
      scheduleOnUI(applyVisibilityUpdates, updates, this.handoff, {
        sessionId,
        elements,
        completed: false,
      });
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

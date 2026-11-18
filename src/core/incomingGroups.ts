import { createContext } from 'react';

// Only the group follows the destination route. Its live owner stays on the source.
export class IncomingGroups {
  private groups = new Map<string, { groupId: string }>();
  private listeners = new Set<() => void>();

  get(screenId: string) {
    return this.groups.get(screenId)?.groupId;
  }

  bind(screenId: string, groupId: string) {
    const changed = this.get(screenId) !== groupId;
    const binding = { groupId };
    this.groups.set(screenId, binding);
    if (changed) this.notify();
    // A timeout for an earlier navigation must not clear a newer binding.
    return () => {
      if (this.groups.get(screenId) === binding) this.remove(screenId);
    };
  }

  remove(screenId: string) {
    if (this.groups.delete(screenId)) this.notify();
  }

  private notify() {
    this.listeners.forEach((notify) => notify());
  }

  subscribe = (notify: () => void) => {
    this.listeners.add(notify);
    return () => {
      this.listeners.delete(notify);
    };
  };
}

export const IncomingGroupsContext = createContext<IncomingGroups | null>(null);

import { createContext, useContext, useLayoutEffect } from 'react';

export class PresentationReadiness {
  private blockers = new Set<symbol>();
  private mounted = false;
  private notified = false;

  constructor(private readonly onReady: () => void) {}

  block = () => {
    const token = Symbol();
    this.blockers.add(token);
    return () => {
      this.blockers.delete(token);
      this.check();
    };
  };

  mount() {
    this.mounted = true;
    this.notified = false;
    this.check();
    return () => {
      this.mounted = false;
    };
  }

  private check() {
    if (this.mounted && !this.notified && this.blockers.size === 0) {
      this.notified = true;
      this.onReady();
    }
  }
}

export const PresentationReadinessContext =
  createContext<PresentationReadiness | null>(null);

export function usePresentationReady(ready: boolean) {
  const gate = useContext(PresentationReadinessContext);
  useLayoutEffect(() => {
    if (!ready) return gate?.block();
    return undefined;
  }, [gate, ready]);
}

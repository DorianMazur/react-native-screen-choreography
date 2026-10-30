import { createContext, useContext, useLayoutEffect, useRef } from 'react';

/** Optional observations of the real demo content, including retained payloads. */
export const TrayExampleObservation = createContext<{
  render: (name: string, phase: 'mount' | 'update') => void;
  mount: (name: string) => () => void;
  scrollEnd?: (name: string) => void;
} | null>(null);

export function useTrayExampleObservation(name: string) {
  const observer = useContext(TrayExampleObservation);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!observer) return;
    observer.render(name, mounted.current ? 'update' : 'mount');
    mounted.current = true;
  });
  useLayoutEffect(() => observer?.mount(name), [observer, name]);
  return observer;
}

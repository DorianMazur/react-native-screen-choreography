import { useEffect, useMemo, useRef } from 'react';
import {
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

export interface ScreenAnimationLifetime {
  suspend: (token: number) => Promise<void>;
  resume: (token: number) => void;
}

export function useScreenAnimationLifetime(
  progress: SharedValue<number> | null
) {
  const suspended = useSharedValue(false);
  const suspensionToken = useSharedValue<number | null>(null);
  const frozenProgress = useSharedValue(0);
  const acknowledgements = useRef(new Set<() => void>());
  useEffect(() => {
    const pending = acknowledgements.current;
    return () => {
      // The controller checks registration again before dispatching a pop.
      // An externally unmounted screen must not leave its fence unresolved.
      for (const acknowledge of pending) acknowledge();
    };
  }, []);
  const screenProgress = useDerivedValue(() =>
    suspended.value ? frozenProgress.value : (progress?.value ?? 0)
  );
  const lifetime = useMemo<ScreenAnimationLifetime>(
    () => ({
      suspend: (token) =>
        new Promise<void>((resolve) => {
          const acknowledge = () => {
            acknowledgements.current.delete(acknowledge);
            resolve();
          };
          acknowledgements.current.add(acknowledge);
          scheduleOnUI(() => {
            'worklet';
            suspensionToken.value = token;
            frozenProgress.value = progress?.value ?? 0;
            suspended.value = true;
            // A mapper/prop flush may already be queued for this frame. Cross
            // a full UI frame before allowing RN to dispatch route removal.
            requestAnimationFrame(() => {
              requestAnimationFrame(() => scheduleOnRN(acknowledge));
            });
          });
        }),
      resume: (token) => {
        scheduleOnUI(() => {
          'worklet';
          if (suspensionToken.value !== token) return;
          suspensionToken.value = null;
          suspended.value = false;
        });
      },
    }),
    [suspended, suspensionToken, frozenProgress, progress]
  );
  return { progress: screenProgress, suspended, lifetime };
}

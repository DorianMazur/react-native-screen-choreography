import { createContext, useEffect, useMemo, type ReactNode } from 'react';
import { useStableCallback } from '../hooks/useStableCallback';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from './ChoreographyContext';

type NavigationBindings = Pick<
  ChoreographyContextType,
  | 'navigationController'
  | 'progress'
  | 'progressOwnership'
  | 'reverseController'
  | 'completeTransition'
  | 'cancelTransition'
  | 'setInteractiveScreen'
> & { getContext: () => ChoreographyContextType };

export const ChoreographyNavigationContext =
  createContext<NavigationBindings | null>(null);

export function ChoreographyContextProvider({
  value,
  children,
}: {
  value: ChoreographyContextType;
  children: ReactNode;
}) {
  const {
    navigationController,
    progress,
    progressOwnership,
    reverseController,
    completeTransition,
    cancelTransition,
    setInteractiveScreen,
  } = value;
  // Commands may run in a child's layout effect, before passive replay listeners.
  const getContext = useStableCallback(() => value);
  const bindings = useMemo(
    () => ({
      navigationController,
      progress,
      progressOwnership,
      reverseController,
      completeTransition,
      cancelTransition,
      setInteractiveScreen,
      getContext,
    }),
    [
      navigationController,
      progress,
      progressOwnership,
      reverseController,
      completeTransition,
      cancelTransition,
      setInteractiveScreen,
      getContext,
    ]
  );

  useEffect(() => {
    navigationController.notifyNavigationStateChanged();
  }, [
    navigationController,
    value.activeSession,
    value.pendingTargetScreenId,
    value.interruptibleReturnSessionId,
    value.overlayHandoffSessionId,
  ]);

  return (
    <ChoreographyNavigationContext.Provider value={bindings}>
      <ChoreographyContext.Provider value={value}>
        {children}
      </ChoreographyContext.Provider>
    </ChoreographyNavigationContext.Provider>
  );
}

import { createContext, useContext } from 'react';

export const TransitionPresentationContext = createContext(false);

export function useTransitionPresentation(): boolean {
  return useContext(TransitionPresentationContext);
}

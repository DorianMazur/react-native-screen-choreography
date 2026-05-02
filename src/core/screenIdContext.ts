import { createContext, useContext } from 'react';

export const ScreenIdContext = createContext<string>('default');

/**
 * Get the screen ID for the current screen.
 * Used by SharedElement to know which screen it belongs to.
 */
export function useScreenId(): string {
  return useContext(ScreenIdContext);
}

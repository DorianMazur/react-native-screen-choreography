import { createContext, useContext } from 'react';

export const ScreenIdContext = createContext<string>('default');

export function useScreenId(): string {
  return useContext(ScreenIdContext);
}

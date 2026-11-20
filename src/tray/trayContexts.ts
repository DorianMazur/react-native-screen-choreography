import { createContext, useContext } from 'react';
import type { TrayKeyboardState } from './presentationTypes';

export const TrayKeyboardContext = createContext<TrayKeyboardState | null>(
  null
);
export const TrayDismissContext = createContext<(() => void) | null>(null);
export const TraySettledContext = createContext<string | undefined>(undefined);

export function useTrayKeyboard() {
  const keyboard = useContext(TrayKeyboardContext);
  if (!keyboard)
    throw new Error('useTrayKeyboard requires a tray screen or header.');
  return keyboard;
}

export function useTrayDismiss() {
  const dismiss = useContext(TrayDismissContext);
  if (!dismiss)
    throw new Error('useTrayDismiss requires a tray screen or header.');
  return dismiss;
}

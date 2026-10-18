import { createContext } from 'react';

export interface ScreenOrigin {
  x: number;
  y: number;
}

export type ScreenGeometry = (screenId: string) => ScreenOrigin | undefined;

export const ScreenGeometryContext = createContext<ScreenGeometry | undefined>(
  undefined
);

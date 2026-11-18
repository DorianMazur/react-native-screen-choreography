import type { ReactNode } from 'react';
import { NativeOverlay } from '../native/NativeOverlay';

export function ChoreographyOverlay({ children }: { children: ReactNode }) {
  return <NativeOverlay>{children}</NativeOverlay>;
}

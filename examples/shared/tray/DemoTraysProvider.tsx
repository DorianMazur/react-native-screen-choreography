import type { ReactNode } from 'react';
import { GalleryPlusTrayProvider } from './GalleryPlusTray';
import { TrayDemoProvider } from './TrayDemo';

export function DemoTraysProvider({ children }: { children: ReactNode }) {
  return (
    <TrayDemoProvider>
      <GalleryPlusTrayProvider>{children}</GalleryPlusTrayProvider>
    </TrayDemoProvider>
  );
}

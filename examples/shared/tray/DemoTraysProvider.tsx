import type { ReactNode } from 'react';
import { GalleryPlusTrayProvider } from './GalleryPlusTray';
import { TrayDemoProvider } from './TrayDemo';

export {
  GalleryPlusTrayProvider,
  GalleryPlusTrayLauncher,
} from './GalleryPlusTray';
export { TrayDemoProvider, TrayDemoLauncher } from './TrayDemo';
export { TrayExampleObservation } from './observation';

export function DemoTraysProvider({ children }: { children: ReactNode }) {
  return (
    <TrayDemoProvider>
      <GalleryPlusTrayProvider>{children}</GalleryPlusTrayProvider>
    </TrayDemoProvider>
  );
}

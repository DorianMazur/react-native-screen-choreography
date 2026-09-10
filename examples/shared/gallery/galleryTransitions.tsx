import type { TransitionRendererProps } from 'react-native-screen-choreography/core';
import { makeTransition, TransitionFrame, Springs } from '../runtime';
export const galleryNavigationOptions = { spring: Springs.default };
function GalleryHeroMotion({
  progress,
  direction,
  source,
  target,
  children,
  zIndex,
}: TransitionRendererProps) {
  return (
    <TransitionFrame
      progress={progress}
      direction={direction}
      sourceMetrics={source.metrics}
      targetMetrics={target.metrics}
      zIndex={zIndex}
    >
      {children}
    </TransitionFrame>
  );
}
export const galleryHeroTransition = makeTransition({
  renderer: GalleryHeroMotion,
  zIndex: 2,
});

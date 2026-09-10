import { makeTransition, TransitionFrame } from '../runtime';
import type { TransitionRendererProps } from 'react-native-screen-choreography/core';
function Surface({
  children,
  source,
  target,
  progress,
  direction,
  zIndex,
}: TransitionRendererProps) {
  return (
    <TransitionFrame
      sourceMetrics={source.metrics}
      targetMetrics={target.metrics}
      progress={progress}
      direction={direction}
      zIndex={zIndex}
    >
      {children}
    </TransitionFrame>
  );
}
export const surfaceTransition = makeTransition({
  renderer: Surface,
  zIndex: 0,
});

import { makeTransition, TransitionFrame } from '../runtime';
import type { TransitionRendererProps } from 'react-native-screen-choreography/core';
function TokenMotion({
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
export const tokenIconTransition = makeTransition({ renderer: TokenMotion });
export const tokenTextTransition = tokenIconTransition;
export const tokenValueTransition = tokenIconTransition;

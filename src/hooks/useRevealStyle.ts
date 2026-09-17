import { useContext } from 'react';
import {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated';
import { ChoreographyControlsContext } from '../core/ChoreographyContext';
import { ChoreographyProgressContext } from '../core/ChoreographyProgressContext';
import { SharedElementPresentationContext } from '../core/SharedElementPresentation';
import {
  resolveRevealRecipe,
  revealInterval,
  type RevealRecipe,
  type RevealOptions,
} from '../transitions/reveal';

export type { RevealOptions } from '../transitions/reveal';

/** Call once per mounted item, never inside a variable-length render loop. */
export function useRevealStyle(
  recipe: RevealRecipe = {},
  { mode = 'enter', scope = 'screen', index = 0, count = 1 }: RevealOptions = {}
) {
  const controls = useContext(ChoreographyControlsContext);
  const state = useContext(ChoreographyProgressContext);
  const presentation = useContext(SharedElementPresentationContext);
  const reduceMotion = useReducedMotion();
  if (!controls || !state)
    throw new Error('useRevealStyle requires a ChoreographyProvider.');
  if (scope === 'presentation' && !presentation)
    throw new Error('Presentation reveals require a SharedElement owner.');
  const resolved = resolveRevealRecipe(recipe, mode);
  const [start, end] = revealInterval(resolved, index, count);
  const { translateX, translateY, scale } = resolved;
  const retained = scope === 'presentation';
  const progress = retained
    ? presentation!.presentationProgress
    : controls.progress;
  const { phase, direction, role, isPendingTarget } = state;
  // Pending destinations have no session role yet. Other inactive screens must
  // remain readable even while a different screen's session is preparing.
  const preparing =
    !retained &&
    (isPendingTarget || (role !== 'inactive' && phase === 'preparing'));
  const visibleAtRest =
    !retained && !preparing && (phase === 'idle' || role === 'inactive');
  return useAnimatedStyle(() => {
    const amount = interpolate(
      preparing ? (direction === 'backward' ? 1 : 0) : progress.value,
      [start, end],
      mode === 'enter' ? [0, 1] : [1, 0],
      'clamp'
    );
    const visible = visibleAtRest ? 1 : amount;
    return {
      opacity: visible,
      transform: [
        { translateY: reduceMotion ? 0 : (1 - visible) * translateY },
        { translateX: reduceMotion ? 0 : (1 - visible) * translateX },
        { scale: reduceMotion ? 1 : scale + (1 - scale) * visible },
      ],
    };
  });
}

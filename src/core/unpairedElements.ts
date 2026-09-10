import type { RegisteredElement, SharedElementTransition } from '../types';

export function canAnimateUnpaired(
  element: RegisteredElement | undefined,
  side: 'source' | 'target',
  direction: 'forward' | 'backward'
): boolean {
  return allowsUnpairedTransition(element?.getTransition?.(), side, direction);
}

export function allowsUnpairedTransition(
  transition: SharedElementTransition | undefined,
  side: 'source' | 'target',
  direction: 'forward' | 'backward'
): boolean {
  if (!transition || transition.mode === 'live') return false;
  const endpoint =
    (side === 'source') === (direction === 'forward')
      ? 'collapsed'
      : 'expanded';
  return transition.unpaired === 'either' || transition.unpaired === endpoint;
}

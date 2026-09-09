import type { SharedValue } from 'react-native-reanimated';
import {
  finishVisibilityHandoff,
  type VisibilityHandoff,
} from './ElementVisibilityRegistry';

export interface ReverseHandoffState {
  sessionId: string;
  token: number;
  targetScreenId: string;
  animationFinished: boolean;
  navigationPresented: boolean;
  completed: boolean;
}

/** Both signals converge on the UI runtime; JS cleanup is not an input gate. */
export function updateReverseHandoff(
  gate: SharedValue<ReverseHandoffState | null>,
  owner: SharedValue<number>,
  visibility: SharedValue<VisibilityHandoff> | undefined,
  interactionOwner: SharedValue<string | null>,
  sessionId: string,
  token: number,
  signal: 'animationFinished' | 'navigationPresented'
): void {
  'worklet';
  const state = gate.value;
  if (
    !state ||
    state.sessionId !== sessionId ||
    state.token !== token ||
    owner.value !== token ||
    state.completed
  )
    return;
  const next = { ...state, [signal]: true };
  if (next.animationFinished && next.navigationPresented) {
    finishVisibilityHandoff(visibility, sessionId);
    interactionOwner.value = next.targetScreenId;
    next.completed = true;
  }
  gate.value = next;
}

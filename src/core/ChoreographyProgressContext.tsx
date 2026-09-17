import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ChoreographyContext } from './ChoreographyContext';
import { useScreenId } from './screenIdContext';
import {
  getScreenRole,
  getSessionPhase,
  type ScreenRole,
  type SessionPhase,
  type TransitionDirection,
} from './screenVisibility';

interface ChoreographyProgressState {
  isActive: boolean;
  isPendingTarget: boolean;
  role: ScreenRole;
  phase: SessionPhase;
  direction: TransitionDirection | null;
  groupId: string | null;
  sessionId: string | null;
}

export const ChoreographyProgressContext =
  createContext<ChoreographyProgressState | null>(null);

export function ChoreographyProgressProvider({
  children,
  isPendingTarget: pendingTarget,
}: {
  children: ReactNode;
  isPendingTarget?: boolean;
}) {
  const choreography = useContext(ChoreographyContext);
  const screenId = useScreenId();
  const session = choreography?.activeSession ?? null;
  const isActive = session !== null;
  const role = getScreenRole(session, screenId);
  const isPendingTarget =
    pendingTarget ?? choreography?.pendingTargetScreenId === screenId;
  const phase = getSessionPhase(
    session,
    isPendingTarget ? screenId : null,
    screenId
  );
  const direction = session?.direction ?? null;
  const groupId = session?.groupId ?? null;
  const sessionId = session?.id ?? null;
  const value = useMemo(
    () => ({
      isActive,
      isPendingTarget,
      role,
      phase,
      direction,
      groupId,
      sessionId,
    }),
    [isActive, isPendingTarget, role, phase, direction, groupId, sessionId]
  );

  return (
    <ChoreographyProgressContext.Provider value={value}>
      {children}
    </ChoreographyProgressContext.Provider>
  );
}

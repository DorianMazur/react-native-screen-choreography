import { useCallback, useContext, useEffect, useRef } from 'react';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import { runReverseTransition } from '../core/runReverseTransition';

interface ChoreographyScreenRemovalOptions {
  screenId: string;
  legacyGroupId?: string;
  legacySourceScreenId?: string;
}

export function useChoreographyScreenRemoval({
  screenId,
  legacyGroupId,
  legacySourceScreenId,
}: ChoreographyScreenRemovalOptions) {
  const choreography = useContext(ChoreographyContext);
  const contextRef = useRef<ChoreographyContextType | null>(choreography);
  const reversePendingRef = useRef(false);

  useEffect(() => {
    contextRef.current = choreography;
  }, [choreography]);

  return useCallback(
    (popAction: () => void): boolean => {
      if (reversePendingRef.current) {
        return true;
      }

      const context = contextRef.current;
      if (!context || context.activeSession) {
        return false;
      }

      const lineage = context.getNavigationLineage(screenId);
      const groupId = lineage?.groupId ?? legacyGroupId;
      const sourceScreenId = lineage?.sourceScreenId ?? legacySourceScreenId;

      if (!groupId || !sourceScreenId) {
        return false;
      }

      reversePendingRef.current = true;
      runReverseTransition({
        ctx: context,
        groupId,
        sourceScreenId,
        currentScreenId: screenId,
        popAction,
      })
        .catch(() => {
          // runReverseTransition falls back to popAction on failure.
        })
        .finally(() => {
          reversePendingRef.current = false;
        });

      return true;
    },
    [legacyGroupId, legacySourceScreenId, screenId]
  );
}

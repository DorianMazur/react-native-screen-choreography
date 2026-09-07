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
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    contextRef.current = choreography;
  }, [choreography]);

  const interceptRemoval = useCallback(
    (
      popAction: () => void,
      canAnimate = true,
      isRouteRemoved?: () => boolean
    ): boolean => {
      if (!canAnimate) return false;
      if (reversePendingRef.current) {
        return true;
      }

      const context = contextRef.current;
      if (
        !context ||
        context.progressOwnership.hasSession ||
        context.navigationController.isNavigationLocked() ||
        !mountedRef.current
      ) {
        return false;
      }

      const lineage = context.getNavigationLineage(screenId);
      const groupId = lineage?.groupId ?? legacyGroupId;
      const sourceScreenId =
        lineage?.sourceScreenId ??
        (legacySourceScreenId
          ? context.resolveScreenId(legacySourceScreenId)
          : undefined);

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
        isRouteRemoved,
        canContinue: () => mountedRef.current,
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

  const lineage = choreography?.getNavigationLineage(screenId);
  const sourceScreenId =
    lineage?.sourceScreenId ??
    (legacySourceScreenId
      ? (choreography?.resolveScreenId(legacySourceScreenId) ?? undefined)
      : undefined);
  return {
    interceptRemoval,
    sourceScreenId,
    sourceRouteKey: lineage?.sourceRouteKey ?? sourceScreenId,
    preventRemove: Boolean(
      choreography && (lineage?.groupId ?? legacyGroupId) && sourceScreenId
    ),
  };
}

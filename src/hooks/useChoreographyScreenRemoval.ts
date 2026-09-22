import { useCallback, useContext, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import {
  ChoreographyContext,
  type ChoreographyContextType,
} from '../core/ChoreographyContext';
import type { CommitBackNavigation } from '../core/navigationCommit';
import {
  reverseActiveSession,
  runReverseTransition,
} from '../core/runReverseTransition';

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
      popAction: CommitBackNavigation,
      canAnimate = true,
      isRouteRemoved?: () => boolean
    ): boolean => {
      if (!canAnimate) return false;
      if (reversePendingRef.current) {
        return true;
      }

      const context = contextRef.current;
      if (!context || !mountedRef.current) return false;

      const session = context.navigationController.getActiveSession();
      // A duration-based opening spring may look finished before it settles.
      // Android Back must reverse it just like the application's Back button.
      const openingSession =
        Platform.OS === 'android' &&
        session?.direction === 'forward' &&
        session.state === 'active' &&
        session.targetScreenId === screenId &&
        context.progressOwnership.isSession(session.id) &&
        !context.reverseController.owns(session.id)
          ? session
          : null;
      if (
        !openingSession &&
        (context.progressOwnership.hasSession ||
          context.navigationController.isNavigationLocked())
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
      const reverse = openingSession
        ? reverseActiveSession({
            ctx: context,
            session: openingSession,
            navigateBack: popAction,
            options: { spring: lineage?.spring },
            canContinue: () => mountedRef.current,
          })?.completion
        : runReverseTransition({
            ctx: context,
            groupId,
            sourceScreenId,
            currentScreenId: screenId,
            popAction,
            isRouteRemoved,
            spring: lineage?.spring,
            canContinue: () => mountedRef.current,
          });
      if (!reverse) {
        reversePendingRef.current = false;
        return false;
      }
      reverse
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

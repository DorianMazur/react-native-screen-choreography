import type { ElementTransitionPair, TransitionSessionData } from '../types';

/** Select before a presentation boundary so unrelated sessions stay outside it. */
export function selectPresentationPair(
  session: TransitionSessionData | null,
  screenId: string,
  groupId: string | undefined,
  id: string,
  participatingSessionId?: string | null
) {
  if (
    !session ||
    (session.state !== 'active' && session.state !== 'preparing') ||
    session.groupId !== groupId
  )
    return null;
  return (
    session.pairs.find(
      (pair) =>
        pair.id === id &&
        (participatingSessionId === session.id ||
          pair.source.screenId === screenId ||
          pair.target.screenId === screenId)
    ) ?? null
  );
}

/** Retain presentation data only, never registrations or native refs. */
export function pairEndpoints(
  pair: ElementTransitionPair,
  direction: TransitionSessionData['direction']
) {
  const source = {
    metrics: pair.sourceMetrics,
    metadata: pair.sourcePresentation.metadata,
    style: pair.sourcePresentation.style,
  };
  const target = {
    metrics: pair.targetMetrics,
    metadata: pair.targetPresentation.metadata,
    style: pair.targetPresentation.style,
  };
  return direction === 'forward'
    ? {
        collapsed: source,
        expanded: target,
        collapsedScreenId: pair.source.screenId,
        expandedScreenId: pair.target.screenId,
      }
    : {
        collapsed: target,
        expanded: source,
        collapsedScreenId: pair.target.screenId,
        expandedScreenId: pair.source.screenId,
      };
}

export function getLiveDestinationHostName(
  screenId: string,
  id: string,
  groupId?: string
) {
  return `screen-choreography:live:destination:${JSON.stringify([screenId, groupId, id])}`;
}

export function getLiveOverlayHostName(
  sourceScreenId: string,
  targetScreenId: string,
  id: string,
  groupId: string
) {
  return `screen-choreography:live:overlay:${JSON.stringify([sourceScreenId, targetScreenId, groupId, id])}`;
}

/** Native presentation waits for this marker; retained content may have no native views of its own. */
export function getLiveContentMarkerId(hostName: string) {
  return `${hostName}:content`;
}

export function getLivePortalName(
  screenId: string,
  id: string,
  groupId?: string
) {
  return `screen-choreography:live:${JSON.stringify([screenId, groupId, id])}`;
}

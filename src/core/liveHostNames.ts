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

export function getLivePortalName(
  screenId: string,
  id: string,
  groupId?: string
) {
  return `screen-choreography:live:${JSON.stringify([screenId, groupId, id])}`;
}

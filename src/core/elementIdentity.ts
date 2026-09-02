export function getElementIdentityKey(
  screenId: string,
  groupId: string | undefined,
  id: string
): string {
  return `${screenId}:${groupId ?? ''}:${id}`;
}

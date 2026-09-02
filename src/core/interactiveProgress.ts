export function toInteractiveSessionProgress(value: number): number {
  'worklet';
  return 1 - Math.max(0, Math.min(1, value));
}

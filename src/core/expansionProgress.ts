export function getExpansionProgress(
  progress: number,
  sourceSize: number,
  targetSize: number
): number {
  'worklet';

  return sourceSize <= targetSize
    ? 1 - (1 - progress) * (1 - progress)
    : progress * progress;
}

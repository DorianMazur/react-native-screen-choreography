export function toInteractiveSessionProgress(value: number): number {
  'worklet';
  return 1 - Math.max(0, Math.min(1, value));
}

export function resolveInteractiveTransitionOutcome({
  progress,
  velocity = 0,
  threshold = 0.5,
  velocityImpact = 0.2,
}: {
  progress: number;
  velocity?: number;
  threshold?: number;
  velocityImpact?: number;
}): 'finish' | 'cancel' {
  const projectedProgress = Math.max(
    0,
    Math.min(1, progress + velocity * velocityImpact)
  );
  return projectedProgress >= threshold ? 'finish' : 'cancel';
}

export interface HeroFrame {
  width: number;
  height: number;
  expansion: number;
}

export function interpolateHero(
  from: HeroFrame,
  to: HeroFrame,
  progress: number
): HeroFrame {
  'worklet';
  const t = Math.max(0, Math.min(1, progress));
  return {
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
    expansion: from.expansion + (to.expansion - from.expansion) * t,
  };
}

export interface RevealRecipe {
  /** Expansion-progress window for the whole group of items. */
  during?: readonly [number, number];
  /** Progress offset between items; compressed when needed to fit during. */
  stagger?: number;
  /** Offsets while hidden; the visible endpoint has zero translation. */
  translateX?: number;
  translateY?: number;
  /** Scale while hidden; the visible endpoint has scale 1. */
  scale?: number;
}

export interface RevealOptions {
  mode?: 'enter' | 'exit';
  /** Screen content is visible at rest. Presentation content follows its owner. */
  scope?: 'screen' | 'presentation';
  /** Zero-based position in a group. Defaults to 0. */
  index?: number;
  /** Current number of items in the group. Defaults to 1. */
  count?: number;
}

export function resolveRevealRecipe(
  recipe: RevealRecipe,
  mode: 'enter' | 'exit'
): Readonly<Required<RevealRecipe>> {
  const during = recipe.during ?? (mode === 'enter' ? [0.55, 0.9] : [0.1, 0.4]);
  if (
    during.length !== 2 ||
    !during.every(Number.isFinite) ||
    during[0]! < 0 ||
    during[1]! > 1 ||
    during[0]! >= during[1]!
  )
    throw new Error('Reveal intervals must increase within [0, 1].');
  const translateX = recipe.translateX ?? 0;
  const translateY = recipe.translateY ?? 0;
  if (!Number.isFinite(translateX) || !Number.isFinite(translateY))
    throw new Error('Reveal translation must be finite.');
  const scale = recipe.scale ?? 1;
  if (!Number.isFinite(scale) || scale < 0)
    throw new Error('Reveal scale must be finite and nonnegative.');
  const stagger = recipe.stagger ?? 0;
  if (!Number.isFinite(stagger) || stagger < 0)
    throw new Error('Reveal stagger must be finite and nonnegative.');
  return Object.freeze({
    during: Object.freeze([during[0]!, during[1]!] as const),
    stagger,
    translateX,
    translateY,
    scale,
  });
}

export function revealInterval(
  recipe: Readonly<Required<RevealRecipe>>,
  index: number,
  count: number
): readonly [number, number] {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error('Reveal count must be a positive safe integer.');
  if (!Number.isSafeInteger(index) || index < 0 || index >= count)
    throw new Error('Reveal index must be an integer within [0, count).');
  const [start, end] = recipe.during;
  // Reserve at least one equal share of the window for each item's animation.
  // Even long dynamic lists finish by end, without inverted or zero intervals.
  const step = Math.min(recipe.stagger, (end - start) / count);
  return [start + step * index, end - step * (count - 1 - index)];
}

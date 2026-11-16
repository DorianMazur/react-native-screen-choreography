import { interpolateColor } from 'react-native-reanimated';

export const cornerRadii = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
] as const;

export const edgeWidths = [
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
] as const;

export const edgeColors = [
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
] as const;

type BorderColorProperty = 'borderColor' | (typeof edgeColors)[number];
export type BorderColors = Partial<Record<BorderColorProperty, string>>;

type BorderProperty =
  | 'borderRadius'
  | 'borderWidth'
  | (typeof cornerRadii)[number]
  | (typeof edgeWidths)[number];
export type BorderGeometry = Partial<Record<BorderProperty, number>>;
/** The border fields a frame reads from an endpoint's frozen style. */
export type BorderStyle = BorderGeometry & BorderColors;

interface BorderRange {
  property: BorderProperty;
  from: number;
  to: number;
}

interface BorderColorRange {
  property: BorderColorProperty;
  from: string;
  to: string;
}

/** Resolve each endpoint's shorthand before handing numeric ranges to the UI. */
function borderRanges(
  shorthand: 'borderRadius' | 'borderWidth',
  source: BorderGeometry = {},
  target: BorderGeometry = {}
): BorderRange[] {
  const ranges: BorderRange[] = [];
  const from = source[shorthand] ?? 0;
  const to = target[shorthand] ?? 0;
  if (source[shorthand] !== undefined || target[shorthand] !== undefined) {
    ranges.push({ property: shorthand, from, to });
  }
  const properties = shorthand === 'borderRadius' ? cornerRadii : edgeWidths;
  for (const property of properties) {
    if (source[property] !== undefined || target[property] !== undefined) {
      ranges.push({
        property,
        from: source[property] ?? from,
        to: target[property] ?? to,
      });
    }
  }
  return ranges;
}

/**
 * Without a color React Native paints a border black. An endpoint that has no
 * color of its own takes the other endpoint's, so a border growing from zero
 * width keeps one color instead of fading through a default.
 */
function borderColors(source: BorderColors = {}, target: BorderColors = {}) {
  const fixed: BorderColors = {};
  const ranges: BorderColorRange[] = [];
  for (const property of ['borderColor', ...edgeColors] as const) {
    if (source[property] === undefined && target[property] === undefined)
      continue;
    const from =
      source[property] ?? source.borderColor ?? target[property] ?? '';
    const to = target[property] ?? target.borderColor ?? from;
    if (from === to) fixed[property] = from;
    else ranges.push({ property, from, to });
  }
  return { fixed, ranges };
}

export function prepareBorderGeometry(
  source?: BorderStyle,
  target?: BorderStyle,
  sourceRadius?: number,
  targetRadius?: number
) {
  const radii = borderRanges(
    'borderRadius',
    sourceRadius === undefined ? source : { borderRadius: sourceRadius },
    targetRadius === undefined ? target : { borderRadius: targetRadius }
  );
  const widths = borderRanges('borderWidth', source, target);
  return {
    radii,
    border: [...radii, ...widths],
    colors: borderColors(source, target),
  };
}

export function interpolateBorderColors(
  ranges: BorderColorRange[],
  progress: number
) {
  'worklet';
  const t = Math.max(0, Math.min(1, progress));
  const style: Partial<Record<BorderColorProperty, string | number>> = {};
  for (const { property, from, to } of ranges) {
    style[property] = interpolateColor(t, [0, 1], [from, to]);
  }
  return style;
}

export function interpolateBorder(ranges: BorderRange[], progress: number) {
  'worklet';
  const t = Math.max(0, Math.min(1, progress));
  const style: BorderGeometry = {};
  for (const { property, from, to } of ranges) {
    style[property] = from + (to - from) * t;
  }
  return style;
}

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

type BorderProperty =
  | 'borderRadius'
  | 'borderWidth'
  | (typeof cornerRadii)[number]
  | (typeof edgeWidths)[number];
export type BorderGeometry = Partial<Record<BorderProperty, number>>;

interface BorderRange {
  property: BorderProperty;
  from: number;
  to: number;
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

export function prepareBorderGeometry(
  source?: BorderGeometry,
  target?: BorderGeometry,
  sourceRadius?: number,
  targetRadius?: number
) {
  const radii = borderRanges(
    'borderRadius',
    sourceRadius === undefined ? source : { borderRadius: sourceRadius },
    targetRadius === undefined ? target : { borderRadius: targetRadius }
  );
  const widths = borderRanges('borderWidth', source, target);
  return { radii, border: [...radii, ...widths] };
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

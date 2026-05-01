import { StyleSheet, type ViewStyle } from 'react-native';

export interface BoxShadowEntry {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  spreadDistance: number;
  color: string;
}

export interface SurfaceTransitionStyle {
  backgroundColor?: string;
  borderRadius?: number;
  boxShadow?: BoxShadowEntry[];
}

function parseBoxShadowFromStyle(
  flat: ViewStyle
): BoxShadowEntry[] | undefined {
  const bs = (flat as any).boxShadow;
  if (!bs) {
    return undefined;
  }

  if (Array.isArray(bs)) {
    return bs.map((entry: any) => ({
      offsetX: typeof entry.offsetX === 'number' ? entry.offsetX : 0,
      offsetY: typeof entry.offsetY === 'number' ? entry.offsetY : 0,
      blurRadius: typeof entry.blurRadius === 'number' ? entry.blurRadius : 0,
      spreadDistance:
        typeof entry.spreadDistance === 'number' ? entry.spreadDistance : 0,
      color: typeof entry.color === 'string' ? entry.color : 'rgba(0,0,0,0)',
    }));
  }

  if (typeof bs === 'string') {
    return parseBoxShadowString(bs);
  }

  return undefined;
}

function parseBoxShadowString(raw: string): BoxShadowEntry[] {
  const result: BoxShadowEntry[] = [];
  for (const part of raw.split(/,(?![^(]*\))/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    let color = 'rgba(0, 0, 0, 0.12)';
    const colorMatch = trimmed.match(/rgba?\([^)]+\)/i);
    if (colorMatch) {
      color = colorMatch[0];
    }

    const withoutColor = trimmed.replace(/rgba?\([^)]+\)/i, '').trim();
    const nums = withoutColor
      .split(/\s+/)
      .map((value) => parseFloat(value) || 0);

    result.push({
      offsetX: nums[0] ?? 0,
      offsetY: nums[1] ?? 0,
      blurRadius: nums[2] ?? 0,
      spreadDistance: nums[3] ?? 0,
      color,
    });
  }

  return result.length > 0
    ? result
    : [
        {
          offsetX: 0,
          offsetY: 0,
          blurRadius: 0,
          spreadDistance: 0,
          color: 'rgba(0,0,0,0)',
        },
      ];
}

export function resolveSurfaceStyle(
  style: ViewStyle | undefined,
  fallback?: {
    backgroundColor?: string;
    borderRadius?: number;
  }
): SurfaceTransitionStyle {
  const flat = (StyleSheet.flatten(style) as ViewStyle | undefined) ?? {};

  return {
    backgroundColor:
      typeof flat.backgroundColor === 'string'
        ? flat.backgroundColor
        : fallback?.backgroundColor,
    borderRadius:
      typeof flat.borderRadius === 'number'
        ? flat.borderRadius
        : fallback?.borderRadius,
    boxShadow: parseBoxShadowFromStyle(flat),
  };
}

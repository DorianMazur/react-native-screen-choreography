import type { SharedValue } from 'react-native-reanimated';

export interface TripPickupPoint {
  active: boolean;
  x: number;
  y: number;
  anchorX: number;
  anchorY: number;
  tilt: number;
}

export interface TripPickupMetadata {
  pickup: SharedValue<TripPickupPoint>;
  landing: SharedValue<number>;
  activityHeight: SharedValue<number>;
}

/** Keep the point that was grabbed underneath the finger as the scene shrinks. */
export function tripPickupPosition(
  frame: { left: number; top: number; width: number; height: number },
  point: TripPickupPoint,
  landing: number
) {
  'worklet';
  if (!point.active) return { left: frame.left, top: frame.top };
  const heldLeft = point.x - point.anchorX * frame.width;
  const heldTop = point.y - point.anchorY * frame.height;
  return {
    left: heldLeft + (frame.left - heldLeft) * landing,
    top: heldTop + (frame.top - heldTop) * landing,
  };
}

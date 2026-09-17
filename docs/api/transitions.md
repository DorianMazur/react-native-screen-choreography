---
title: Transitions
description: Declarative recipes, custom renderers, geometry primitives, and motion presets.
---

# Transitions

These exports are available from `/core` and both integration entries. Create transition definitions and factory results outside render, or memoize them, and reuse them on both endpoints.

## `defineTransition`

Creates typed, named shared roles and local reveal components.

```tsx
const artwork = defineTransition({
  motion: { spring: Springs.default },
  shared: { hero: { kind: 'bounds', radius: [24, 32] } },
  enter: { details: { during: [0.55, 0.9], translateY: 16 } },
  exit: { caption: { during: [0.1, 0.4] } },
});
```

| Definition field | Accepted value                                                                  |
| ---------------- | ------------------------------------------------------------------------------- |
| `motion`         | `{ spring?: SpringConfig; duration?: number }`                                  |
| `shared`         | Record of names to `SharedMotionRecipe` or a `Transition` from `makeTransition` |
| `enter`          | Record of names to `RevealRecipe`                                               |
| `exit`           | Record of names to `RevealRecipe`                                               |

```ts
interface SharedMotionRecipe {
  kind: 'bounds' | 'surface';
  radius?: readonly [number, number]; // Collapsed, expanded.
  zIndex?: number;
}

interface RevealRecipe {
  during?: readonly [number, number];
  translateY?: number;
}
```

At least one role is required. Role names cannot be empty. Radius values must be finite and nonnegative; reveal intervals must increase within `[0, 1]`. Duration, if supplied, must be finite and positive.

The result contains:

| Member              | Props / behavior                                                              |
| ------------------- | ----------------------------------------------------------------------------- |
| `Element`           | Owner props, with a typed `name` replacing `id` and `transition`              |
| `Element.Target`    | Target props, with the same typed `name`                                      |
| `Enter`             | `{ name, children, style? }`; local content reveals as expansion increases    |
| `Exit`              | `{ name, children, style? }`; local content disappears as expansion increases |
| `navigationOptions` | Readonly motion options to spread into navigation requests                    |

Default enter interval: `[0.55, 0.9]`. Default exit interval: `[0.1, 0.4]`. Translation defaults to `0`, and reveals are visible when idle. Reduced motion disables their translation; opacity remains progress-driven. Shared recipes default to `zIndex: 100` through the transition factory.

See [defining motion](../guide/transitions.md) for placement and context guidance.

## `makeTransition`

Wraps a custom renderer while the library owns its live portal host.

```ts
makeTransition(options: MakeTransitionOptions): Transition;

interface MakeTransitionOptions {
  renderer: ComponentType<TransitionRendererProps>;
  zIndex?: number; // 100
}
```

Renderer props include `id`, `groupId`, `progress`, `direction`, `zIndex`, `source`, `target`, and `children`. Each endpoint provides `screenId`, measured `metrics`, optional `style`, and `metadata?: unknown`.

Render `children` **exactly once**, continuously through the session. It is the library-owned portal host, not a second content component. Source and target presentations are captured at session start; metadata is captured by reference.

`progress` is expansion progress (`0` collapsed, `1` expanded). Source and target follow navigation direction. Convert to `direction === 'backward' ? 1 - progress.value : progress.value` when interpolating from source metrics to target metrics directly.

The exported renderer type includes optional `anchors`; the 0.5.0 `makeTransition` adapter does not forward them. Use the supplied endpoint metrics for custom renderer geometry.

## `TransitionFrame`

An absolute animated frame for position, width, height, and optional corner radius. Pass the renderer's `children` inside it.

| Prop                                       | Type                      | Default                                                        |
| ------------------------------------------ | ------------------------- | -------------------------------------------------------------- |
| `progress`                                 | `SharedValue<number>`     | Required expansion progress                                    |
| `sourceMetrics`, `targetMetrics`           | `ElementMetrics`          | Required endpoint rectangles                                   |
| `direction`                                | `'forward' \| 'backward'` | `'forward'`                                                    |
| `sourceBorderRadius`, `targetBorderRadius` | `number`                  | Omitted; missing side resolves to `0` if the other is supplied |
| `zIndex`                                   | `number`                  | `1`                                                            |
| `children`                                 | `ReactNode`               | Optional                                                       |

Metrics contain `pageX`, `pageY`, `width`, and `height`. The frame interpolates source-to-target geometry with direction handling built in. Supplying a radius enables clipping. It does not paint a background or shadow and uses `pointerEvents="none"` during overlay presentation.

## `TransitionSurface`

Adds interpolated background color and corner radius around a live host, with an expanded-side shadow.

Uses the same required `progress`, `sourceMetrics`, and `targetMetrics` as `TransitionFrame`, plus:

| Prop                         | Type                      | Default     |
| ---------------------------- | ------------------------- | ----------- |
| `direction`                  | `'forward' \| 'backward'` | `'forward'` |
| `sourceStyle`, `targetStyle` | `SurfaceTransitionStyle`  | `{}`        |
| `zIndex`                     | `number`                  | `0`         |
| `children`                   | `ReactNode`               | Optional    |

Missing background colors become transparent and missing radii become `0`. The surface clips its content. Its shadow uses the expanded endpoint's static `boxShadow` and animates opacity, fading near the endpoints. It does not interpolate shadow parameters each frame.

## `resolveSurfaceStyle`

Extracts supported surface fields from a view style.

```ts
resolveSurfaceStyle(
  style: ViewStyle | undefined,
  fallback?: { backgroundColor?: string; borderRadius?: number },
): SurfaceTransitionStyle;

interface SurfaceTransitionStyle {
  backgroundColor?: string;
  borderRadius?: number;
  boxShadow?: BoxShadowEntry[];
}
```

Recognizes string background colors, numeric corner radius, and `boxShadow`. It does not convert legacy `shadowColor`, `shadowOffset`, or Android `elevation`. Prefer object-array shadows with numeric offsets, blur, spread, and a string color. String shadow parsing is limited; it is not a general CSS parser.

## `Springs`

Reusable `SpringConfig` presets:

| Preset    | Damping | Mass | Stiffness |
| --------- | ------- | ---- | --------- |
| `default` | 28      | 1    | 240       |
| `snappy`  | 20      | 0.8  | 300       |
| `fast`    | 28      | 1    | 400       |
| `gentle`  | 28      | 1    | 180       |

`default` and `fast` also set overshoot clamping and rest thresholds of `0.001`.

`SpringConfig` supports either a physics spring with `stiffness` and `damping`, or a duration-based spring with `duration` and `dampingRatio`. Do not mix these two sets of fields. Both forms also accept `mass`, `velocity`, `overshootClamping`, `restDisplacementThreshold`, and `restSpeedThreshold`. All fields are optional.

```ts
const motion = { spring: { duration: 800, dampingRatio: 1 } };
```

Duration-based springs are preserved during return and interactive settlement without adding physics-only defaults. `spring.duration` configures a spring; the separate top-level `duration` option selects a timing animation.

## `Easings`

Reanimated easing helpers for your own animations: `contentReveal` is cubic ease-out, `smooth` is cubic ease-in-out, and `sharp` is quadratic ease-out. Navigation options do not expose a custom easing field.

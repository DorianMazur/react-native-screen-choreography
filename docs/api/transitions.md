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
  during?: readonly [number, number]; // Window for the whole group.
  stagger?: number; // Progress offset between items; defaults to 0.
  translateX?: number;
  translateY?: number;
  scale?: number; // Hidden scale; defaults to 1.
}
```

At least one role is required. Role names cannot be empty. Radius values must be finite and nonnegative; reveal intervals must increase within `[0, 1]`. Duration, if supplied, must be finite and positive.

The result contains:

| Member              | Props / behavior                                                                     |
| ------------------- | ------------------------------------------------------------------------------------ |
| `Element`           | Owner props, with a typed `name` replacing `id` and `transition`                     |
| `Element.Target`    | Target props, with the same typed `name`                                             |
| `Enter`             | `{ name, children, style?, index?, count?, scope? }`; reveals as expansion increases |
| `Exit`              | Same props as `Enter`; disappears as expansion increases                             |
| `navigationOptions` | Readonly motion options to spread into navigation requests                           |

Default enter interval: `[0.55, 0.9]`. Default exit interval: `[0.1, 0.4]`. Translations default to `0`; hidden scale defaults to `1`. The visible endpoint always has zero translation and scale `1`. Reduced motion disables both translation and scale; opacity remains progress-driven. Shared recipes default to `zIndex: 100` through the transition factory.

`index` defaults to `0` and `count` to `1`. For a dynamic list, pass each item's current index and the list length. Each component owns its hooks, so inserting, removing, and reordering keyed items is supported. `during` is the whole group's interval. The effective stagger is `min(stagger, (end - start) / count)`; the remaining interval is each item's animation duration. This compresses excessive staggering so all items finish by `end`. Forward expansion starts lower indices first; reversing progress reverses the sequence. Changes to index or count immediately recompute the interval.

`count` must be a positive safe integer and `index` an integer in `[0, count)`. An empty list simply renders no reveal components. Translations must be finite; scale and stagger must be finite and nonnegative. Definitions capture their recipes at creation.

`scope` defaults to `'screen'`: the reveal follows the enclosing screen only when it participates in a transition, and is fully visible while idle or inactive. Incoming screens prepare from their starting endpoint even before they have a session role. Use `scope="presentation"` inside a retained `SharedElement` owner: the reveal follows that owner's `presentationProgress`, including its resting endpoint, independently of other groups. Presentation enter content stays hidden when collapsed; presentation exit content stays hidden when expanded. This scope requires an owner and does not change React ownership.

Reveals animate opacity and transforms only. They keep children mounted and do not change touch or accessibility behavior. They own the wrapper's opacity and transform; put additional transforms on a nested view. For the same behavior on an existing animated view, use [`useRevealStyle`](./hooks.md#userevealstyle).

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

Renderer props include `id`, `groupId`, `progress`, `direction`, `zIndex`, `source`, `target`, `anchors`, and `children`. Each endpoint provides `screenId`, measured `metrics`, optional `style`, and `metadata?: unknown`.

Render `children` **exactly once**, continuously through the session. It is the library-owned portal host, not a second content component. Source and target presentations are captured at session start; metadata is captured by reference.

`progress` is expansion progress (`0` collapsed, `1` expanded). Source and target follow navigation direction. Convert to `direction === 'backward' ? 1 - progress.value : progress.value` when interpolating from source metrics to target metrics directly.

`anchors` is a read-only map keyed by element ID containing only the current session's matched elements (including the renderer's own element). Each `TransitionAnchor` contains `collapsed` and `expanded` rectangles with `pageX`, `pageY`, `width`, and `height`. These names always mean expansion endpoints, including on back: collapsed is the forward source / backward target; expanded is the forward target / backward source. Interpolate these endpoints using expansion `progress` directly.

Anchors update together with renderer endpoint metrics when the session's measurements refresh. They contain geometry only, with no native refs, registrations, styles, metadata, or React content. Optional or unmatched elements have no entry; guard lookups such as `anchors?.artwork` before using them. The prop remains optional for renderers invoked outside the overlay.

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

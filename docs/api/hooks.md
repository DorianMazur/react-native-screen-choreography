---
title: Hooks and utilities
description: Shared progress, retained presentation, readiness, reveal helpers, and debug control.
---

# Hooks and utilities

These exports are available from `/core` and both integration entries. Hooks require a provider. Place screen-specific hooks in components beneath `ChoreographyScreen`; place the retained-presentation hook inside the shared owner.

## `useChoreographyProgress`

Reads the expansion clock, current session state, and screen role.

```tsx
const {
  progress,
  backdropStyle,
  settleTransition,
  isActive,
  role,
  phase,
  direction,
  groupId,
  sessionId,
} = useChoreographyProgress();
```

| Value                  | Type / meaning                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `progress`             | `SharedValue<number>`; `0` collapsed, `1` expanded                                 |
| `backdropStyle`        | Animated opacity from `0` to `0.5` over progress `[0, 0.3]`                        |
| `settleTransition`     | `() => void`; settles in favor of the calling screen                               |
| `isActive`             | `boolean`; a session exists, including preparation / settlement states             |
| `role`                 | `'source' \| 'target' \| 'inactive'`, relative to the current navigation direction |
| `phase`                | `'idle' \| 'preparing' \| 'active' \| 'completing' \| 'cancelling'`                |
| `direction`            | `'forward' \| 'backward' \| null`                                                  |
| `groupId`, `sessionId` | `string \| null`                                                                   |

Read `progress.value` inside Reanimated worklets for frame-by-frame motion. `isActive` is not a synonym for `phase === 'active'`. A pending target can have phase `preparing` before a session exists.

`backdropStyle` supplies opacity only. Apply your own positioning, background color, and pointer-event behavior to the backdrop view.

## `useChoreographyControls`

Reads the screen-scoped interaction control without subscribing to session state.

```tsx
const { settleTransition } = useChoreographyControls();

<ScrollView onScrollBeginDrag={settleTransition} />;
```

Use `settleTransition()` when ordinary interaction should finish the active choreography in favor of the calling screen. It is not the custom gesture's `settle(options)` decision method.

## `useSharedElementPresentation`

Reads retained endpoint information from inside a `SharedElement` owner.

```ts
useSharedElementPresentation(): SharedElementPresentation;

interface SharedElementPresentation {
  progress: SharedValue<number>;
  presentationProgress: DerivedValue<number>;
  transitioning: boolean;
  collapsed: SharedElementEndpoint;
  expanded: SharedElementEndpoint;
  settled: 'collapsed' | 'expanded';
}

interface SharedElementEndpoint {
  metrics: ElementMetrics | null;
  metadata?: unknown;
  style?: ViewStyle;
}
```

`progress` is the provider-wide expansion clock; it remains unchanged for compatibility and can be driven by another element or group. `presentationProgress` is a read-only Reanimated derived value belonging to this retained owner: it follows `progress` during participation, stays at `0` when settled at the original source (collapsed), and stays at `1` when settled at the destination (expanded). Unrelated transitions leave it unchanged. Backward transitions run from `1` to `0`; cancellation returns it to the endpoint where the element settles. `transitioning` identifies active participation by this owner. `settled` identifies its resting endpoint when no motion is active. Before the first transition, metrics are `null` and the initial endpoint presentation comes from the owner.

This hook does not change React ownership. The retained component still uses the original source context; use these explicit endpoints for its visual adaptation. Narrow `metadata` before reading it and keep metadata objects immutable during a session.

## `useChoreographyBlocker`

Acquires a readiness hold for the enclosing screen.

```ts
const { acquire } = useChoreographyBlocker();
const release: () => void = acquire();
release();
```

Acquire during a layout effect or an appropriate application lifecycle, not during render. Every acquisition must release on completion, failure, or cleanup. Release functions are idempotent. All blockers and the screen's `ready` gate must clear for readiness. See [readiness](../guide/readiness.md) for a cleanup-safe example.

## `useLatchedReveal`

Returns a boolean for conditionally mounting supporting content.

```ts
useLatchedReveal(config?: {
  startProgress?: number;     // 0.7
  resetKey?: unknown;
  visibleWhenInactive?: boolean; // true
}): boolean;
```

The gate opens when progress reaches `startProgress`. It latches for that reveal, and visibility is recomputed when relevant configuration, active-session state, or `resetKey` changes. By default it is visible while no session is active.

It does not animate the mounted content and should not delay mounting shared targets that must be measured. Use a named `Enter` role for an animated reveal.

## `useStaggeredReveal`

Creates progress-driven opacity and vertical-translation styles for a fixed set of items.

```ts
const { getItemStyle, progress } = useStaggeredReveal(itemCount, {
  startProgress: 0.7,
  endProgress: 1,
  stagger: 0.05,
  translateY: 16,
});
```

All configuration fields are optional; the values above are the defaults. `stagger` is a progress offset between items, not milliseconds. `getItemStyle(index)` returns an animated style, and `progress` is the expansion shared value.

::: warning Keep calls in a stable order
In 0.5.0, `getItemStyle` calls a React hook internally. Call it an unconditional, fixed number of times in a component; do not call it in a variable-length list or event handler. For dynamic content, prefer separately mounted components with declarative `Enter` roles or their own `useAnimatedStyle`.
:::

```tsx
const { getItemStyle } = useStaggeredReveal(2);
const titleStyle = getItemStyle(0);
const bodyStyle = getItemStyle(1);

return (
  <>
    <Animated.View style={titleStyle}>
      <Title />
    </Animated.View>
    <Animated.View style={bodyStyle}>
      <Description />
    </Animated.View>
  </>
);
```

The helper is driven directly by progress and does not add an idle visibility override or a reduced-motion translation override. For ordinary readable idle content and built-in reduced-motion handling, use [`defineTransition`](./transitions.md#definetransition) reveals.

## `setDebugEnabled`

```ts
setDebugEnabled(enabled: boolean): void;
```

Toggles the library logger imperatively. It does not set log level or category filtering. Prefer the provider's `debug` prop when logging follows application configuration; provider configuration updates can reapply logger state. See [troubleshooting](../guide/troubleshooting.md#turn-on-diagnostics).

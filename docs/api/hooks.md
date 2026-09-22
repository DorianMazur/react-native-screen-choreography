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
  isPendingTarget,
  role,
  phase,
  direction,
  groupId,
  sessionId,
} = useChoreographyProgress();
```

| Value                  | Type / meaning                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `progress`             | `SharedValue<number>`; `0` collapsed, `1` expanded                                   |
| `backdropStyle`        | Animated opacity from `0` to `0.5` over progress `[0, 0.3]`                          |
| `settleTransition`     | `() => void`; settles in favor of the calling screen                                 |
| `isActive`             | `boolean`; a session exists, including preparation / settlement states               |
| `isPendingTarget`      | `boolean`; this screen is the pending destination, even before a session role exists |
| `role`                 | `'source' \| 'target' \| 'inactive'`, relative to the current navigation direction   |
| `phase`                | `'idle' \| 'preparing' \| 'active' \| 'completing' \| 'cancelling'`                  |
| `direction`            | `'forward' \| 'backward' \| null`                                                    |
| `groupId`, `sessionId` | `string \| null`                                                                     |

Read `progress.value` inside Reanimated worklets for frame-by-frame motion. `isActive` is not a synonym for `phase === 'active'`. A pending target can have phase `preparing` before a session exists.

Within `ChoreographyScreen`, progress follows that screen's lifetime. On Android it freezes just before an outgoing route is removed, while the shared-element overlay finishes its return. For retained content that must follow the whole transition, use `useSharedElementPresentation().presentationProgress` or presentation-scoped reveals.

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
  direction: 'forward' | 'backward' | null;
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

`direction` is the participating owner's active session direction, or `null` while it is at rest or another owner is transitioning. It describes navigation intent, so reversing a drag does not change it. Read it here when adapting retained content instead of subscribing to the screen-wide progress state only for direction.

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

The gate opens when this screen participates in an active transition and progress reaches `startProgress`. Threshold checks run on the UI thread, including when the hook mounts after progress has already passed the threshold. Once content becomes visible, either at its threshold or through the inactive fallback, the gate stays open as progress reverses, after settlement, and during later transitions. Changing `resetKey` starts a fresh gate; changing `startProgress` affects a gate that has not opened yet.

An unopened gate on a pending forward destination stays closed while preparing, including before a session exists and when the shared progress still holds a previous transition's value. By default, an idle screen or a screen outside the current transition remains readable. `visibleWhenInactive: false` disables that fallback; it does not close an already opened gate. A reused destination retains its already visible content; change `resetKey` when its content identity changes and needs a new reveal. Queued reveal callbacks from an earlier session, reset key, or threshold cannot open a newer gate.

It does not animate the mounted content and should not delay mounting shared targets that must be measured. Use a named `Enter` role for an animated reveal.

## `useRevealStyle`

Returns a Reanimated opacity/transform style for one mounted item. It shares the recipe and scoping behavior of declarative `Enter` and `Exit` components.

```tsx
import Animated from 'react-native-reanimated';
import { useRevealStyle } from 'react-native-screen-choreography/core';

function RevealedRow({ item, index, count }) {
  const style = useRevealStyle(
    { during: [0.55, 0.95], stagger: 0.05, translateY: 16, scale: 0.96 },
    { index, count }
  );
  return (
    <Animated.View style={style}>
      <Row item={item} />
    </Animated.View>
  );
}

// Each keyed child owns its hooks. The list can grow, shrink, or reorder.
items.map((item, index) => (
  <RevealedRow key={item.id} item={item} index={index} count={items.length} />
));
```

```ts
useRevealStyle(recipe?: RevealRecipe, options?: RevealOptions);

interface RevealOptions {
  mode?: 'enter' | 'exit'; // 'enter'
  scope?: 'screen' | 'presentation'; // 'screen'
  index?: number; // 0
  count?: number; // 1
}
```

`RevealRecipe` accepts `during`, `stagger`, `translateX`, `translateY`, and `scale`; see [reveal recipes](./transitions.md#definetransition) for defaults, interval calculation, and validation. Unlike the legacy stagger helper, staggering and translation default to zero. `mode: 'exit'` reverses opacity and uses the default exit interval `[0.1, 0.4]` instead of the enter interval `[0.55, 0.9]`.

Screen scope leaves idle and unrelated screens visible. Presentation scope requires a retained owner and follows its resting collapsed/expanded endpoint as well as transitions. Reduced motion removes translation and scale, preserving opacity. The hook does not mount/unmount children or manage touches and accessibility.

Call this hook unconditionally inside each item component, not inside the parent's `.map()` or an event handler. Use declarative `Enter`/`Exit` directly in a map when an additional wrapper is convenient.

### Migrating the removed stagger helper

`useStaggeredReveal` and its `getItemStyle` callback have been removed. Replace them with `useRevealStyle` inside each item's component, or declarative `Enter`/`Exit` with `index` and `count`.

Replace `startProgress`/`endProgress` with `during: [startProgress, endProgress]` and pass `stagger` and `translateY` explicitly. The old defaults correspond to `{ during: [0.7, 1], stagger: 0.05, translateY: 16 }`. The new API keeps the entire stagger within `during`, so a long list may have tighter spacing. It also keeps idle/unrelated screen content visible and respects reduced motion. For direct access to the expansion clock previously returned by the helper, use `useChoreographyProgress`.

## `setDebugEnabled`

```ts
setDebugEnabled(enabled: boolean): void;
```

Toggles the library logger imperatively. It does not set log level or category filtering. Prefer the provider's `debug` prop when logging follows application configuration; provider configuration updates can reapply logger state. See [troubleshooting](../guide/troubleshooting.md#turn-on-diagnostics).

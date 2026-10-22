---
title: Hooks and utilities
description: Shared progress, retained presentation, readiness, reveal helpers, and debug control.
---

# Hooks and utilities

These hooks are available from `/core` and both integration entries, and require a `ChoreographyProvider`.

| What you want to do                                          | Hook                           | Where to call it                                                         |
| ------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------ |
| Animate a screen's backdrop or supporting content            | `useChoreographyProgress`      | Beneath `ChoreographyScreen`                                             |
| Finish motion when the user starts scrolling or interacting  | `useChoreographyControls`      | Beneath `ChoreographyScreen`                                             |
| Adapt a shared component to its source and destination sizes | `useSharedElementPresentation` | Inside the `SharedElement` owner                                         |
| Wait for a child to finish loading or layout                 | `useChoreographyBlocker`       | Beneath `ChoreographyScreen`                                             |
| Delay rendering an expensive supporting section              | `useLatchedReveal`             | Beneath `ChoreographyScreen`                                             |
| Fade or move content that is already mounted                 | `useRevealStyle`               | Beneath `ChoreographyScreen`, or inside an owner with presentation scope |

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

## `useChoreographyProgressValue`

Returns only the expansion clock as a `SharedValue<number>`: `0` is collapsed and `1` is expanded. Use it when a component needs custom animated styles but no React session state or built-in backdrop style.

```tsx
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useChoreographyProgressValue } from 'react-native-screen-choreography/core';

function Backdrop() {
  const progress = useChoreographyProgressValue();
  const style = useAnimatedStyle(() => ({ opacity: progress.value * 0.4 }));
  return (
    <Animated.View pointerEvents="none" style={[styles.backdrop, style]} />
  );
}
```

The hook does not subscribe to session phases, roles, groups, or pending targets, and does not allocate an animated style. Session-state changes alone do not rerender its consumer; normal parent and prop updates still apply. Read the value in a worklet and let the library drive it.

Call it inside the screen whose views you animate. It returns the same clock as `useChoreographyProgress().progress`, including Android's freeze before outgoing route removal. Outside a `ChoreographyScreen`, it returns the provider clock. Do not mirror another screen's clock into outgoing views, because that bypasses their lifetime protection.

The clock is not filtered by group and does not retain an individual element's settled endpoint. For retained shared content, use `useSharedElementPresentation().presentationProgress`. Use `useChoreographyProgress` when you need session state, or `useChoreographyControls` for `settleTransition`.

## `useChoreographyControls`

Provides `settleTransition` when you only need to finish motion in response to interaction. Use `useChoreographyProgress` when you also need progress or transition state.

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
  frame: DerivedValue<{ width: number; height: number } | null>;
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

Use `presentationProgress` for animations inside shared content. It follows this element's motion and holds its resting value when another group transitions.

| Value                   | Meaning                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `presentationProgress`  | Read-only progress for this owner: `0` at the source, `1` at the destination; back moves from `1` to `0`                             |
| `frame`                 | UI-thread width and height matching `TransitionFrame`, from preparation through motion; `null` when unpaired or using reduced motion |
| `progress`              | Provider-wide expansion clock, which can also be driven by other elements or groups                                                  |
| `collapsed`, `expanded` | Original source and expanded destination geometry, styles, and metadata, regardless of navigation direction                          |
| `transitioning`         | `true` while this owner's content is in the transition overlay; `false` during preparation and at rest                               |
| `direction`             | This owner's participating navigation direction; `null` during preparation or when it does not participate                           |
| `settled`               | The endpoint where the content rests after motion                                                                                    |

Before the first transition, endpoint metrics are `null` and presentation data comes from the owner. Guard against null metrics before calculating layout. Narrow `metadata` before reading it and keep metadata objects immutable during a session.

Read `frame.value` in an animated style or derived value when hosted content needs explicit dimensions. It uses clamped, linear endpoint interpolation; a custom renderer's geometry may differ.

Cancellation returns progress to the endpoint where the content settles. If the destination unmounts through a navigation reset or another removal without a completed return, the content returns to its source and progress holds at `0`.

The retained component keeps its original source context. Use this hook for its visual adaptation and transition direction. `direction` describes navigation intent, so changing drag direction does not change it. `transitioning` becomes true when content moves into the overlay, which can happen after preparation has started; use it when coordinating visibility with that transfer. With reduced motion, content moves directly to its endpoint and `transitioning` stays false.

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

Returns `true` when this screen's active transition reaches `startProgress`, including if the hook mounts after that threshold. Once visible, content stays visible through reverse motion, settlement, and later transitions. Changing `resetKey` starts a fresh gate; changing `startProgress` affects a gate that has not opened yet.

New content on a forward destination stays hidden during preparation. Idle screens and screens outside the current transition show their content by default, so direct entry and ordinary navigation remain readable. Set `visibleWhenInactive: false` to disable that fallback; it does not close an already opened gate. For a reused screen, set `resetKey` to the content's identity if new content should reveal again.

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

`RevealRecipe` accepts `during`, `stagger`, `translateX`, `translateY`, and `scale`; see [reveal recipes](./transitions.md#definetransition) for defaults, interval calculation, and validation. Staggering and translation default to zero. `mode: 'exit'` reverses opacity and uses the default exit interval `[0.1, 0.4]` instead of the enter interval `[0.55, 0.9]`.

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

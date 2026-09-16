---
title: Components
description: Props and lifecycle behavior for the provider, screen wrapper, and retained shared elements.
---

# Components

Import these from your integration entry unless noted otherwise. The root entry selects React Navigation; `/expo-router` selects Expo Router. Shared components are also available from `/core`.

## `ChoreographyProvider`

Owns the shared progress clock, transition sessions, element registry, and native overlay. Mount one stable provider above the navigator.

```tsx
<ChoreographyProvider debug={false}>
  <NavigationContainer>{/* native stack */}</NavigationContainer>
</ChoreographyProvider>
```

| Prop                 | Type                                            | Default / behavior                                       |
| -------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `children`           | `ReactNode`                                     | Required app content                                     |
| `debug`              | `ChoreographyDebugConfig`                       | `false`; `true` enables info, warning, and error logs    |
| `onTransitionStart`  | Session callback                                | Called when a session becomes active with resolved pairs |
| `onTransitionEnd`    | Session callback                                | Called when a session completes **or is cancelled**      |
| `onPreparationTrace` | `(trace: ChoreographyPreparationTrace) => void` | Optional deferred startup diagnostics                    |

Derive callback types from the component when you need a named application handler; the internal session type is not separately exported from the public entry.

```tsx
import type { ComponentProps } from 'react';

type ProviderProps = ComponentProps<typeof ChoreographyProvider>;
const onStart: ProviderProps['onTransitionStart'] = (session) => {
  console.log(session.groupId, session.direction, session.pairs.length);
};
```

Preparation traces include a group, source and target screen IDs, direction, outcome, and timed stages. The clock is `js-performance-now`; outcomes include `overlay-ready`, `overlay-timeout`, `cancelled`, `unavailable`, and `failed`. Treat this as preparation diagnostics, not an animation completion event or frame-rate benchmark.

### Debug configuration

```ts
type ChoreographyDebugConfig =
  | boolean
  | {
      level?: 'error' | 'warn' | 'info' | 'trace';
      categories?: ChoreographyDebugCategory[];
      logEveryFrame?: boolean;
    };
```

Object configuration defaults to level `info`. Identical consecutive messages are coalesced unless `logEveryFrame` is `true`. In 0.5.0, `categories` is declared in the type but the provider does not apply category filtering; use `level` to control verbosity.

## `ChoreographyScreen`

Identifies a screen and coordinates its readiness, visibility, removal handling, and screen-scoped progress context. Available only from the integration entries.

```ts
// Prop shape; derive with ComponentProps when importing a named type is needed.
{
  screenId: string;
  children: ReactNode;
  ready?: boolean; // default: true
  keepVisible?: boolean; // default: false
  allowInteractionDuringTransition?: boolean; // default: true
}
```

Use a stable application label for `screenId`. For React Navigation, match the route name; for Expo Router, match `targetScreenId` on navigation requests. Adapters use the actual route key internally to distinguish multiple instances.

`allowInteractionDuringTransition` defaults to `true` and lets the arriving screen receive touches during active motion, for example so a back button can interrupt an opening transition. Set it to `false` to block the arriving screen until the transition completes. Preparation and the outgoing screen remain blocked unless that source is explicitly driving a gesture with `useInteractiveTransition`. A gesture source keeps its visibility and input until finish or cancel, so collapsing the shared content does not terminate the held touch. Shared content in the native overlay remains non-interactive; place the back button’s touch target on the destination screen. Other destination controls should disable themselves while transitioning if they are not safe to use.

`ready` adds an application gate after the screen lays out. It does not replace layout readiness. Readiness also waits for acquired blockers. See [readiness](../guide/readiness.md).

`keepVisible` keeps the screen at full opacity while a session runs instead of cross-fading it with the other endpoint. Set it on the source screen when the destination is transparent and the source is its backdrop, for example a preview presented over the list it came from. It does not change readiness, interaction blocking, or the pre-activation gate on a forward destination.

The wrapper handles eligible single-route back removal for reverse choreography. Multi-route resets and removals outside the recorded return path are not equivalent to a shared reverse transition.

## `SharedElement`

Owns the **one live content subtree**. Pair it with `SharedElement.Target` on the destination.

```tsx
<SharedElement id="hero" groupId="artwork.42" style={{ height: 220 }}>
  <Artwork />
</SharedElement>
```

| Prop          | Type                   | Behavior                                                                   |
| ------------- | ---------------------- | -------------------------------------------------------------------------- |
| `id`          | `string`               | Required identity within a screen and group                                |
| `groupId`     | `string`               | Match it on both endpoints and in navigation options                       |
| `children`    | `ReactNode`            | Required retained content                                                  |
| `transition`  | `Transition`           | Default bounds transition; reuse the same factory result at both endpoints |
| `style`       | `StyleProp<ViewStyle>` | Measured wrapper geometry and endpoint presentation style                  |
| `portalStyle` | `StyleProp<ViewStyle>` | Payload layout overrides, after the portal's fill defaults                 |
| `metadata`    | `unknown`              | Endpoint data captured by reference at session start                       |

`SharedElementProps` is exported. Registration identity is the tuple of screen, group, and element ID. Normal prop updates do not re-register the element; the session captures endpoint presentations when it starts.

The owner keeps its original React context when moved into the overlay or destination. Keep it mounted for the lifetime of the retained content. Use [`useSharedElementPresentation`](./hooks.md#usesharedelementpresentation) for endpoint-specific layout inside it.

### `SharedElement.Target`

An empty receiving host with measurable bounds. It does **not** accept children.

```tsx
<SharedElement.Target id="hero" groupId="artwork.42" style={{ height: 380 }} />
```

`SharedElementTargetProps` is exported. It shares `id`, `groupId`, `transition`, `style`, and `metadata` with the owner. Its additional `hostStyle?: StyleProp<ViewStyle>` adjusts the receiving host independently of the measured wrapper. The host defaults to absolute fill.

Give an empty target explicit dimensions or another nonzero layout constraint. Use one owner and one target for each pair; do not duplicate the content on the destination.

::: warning Keep presentation data immutable
Endpoint metrics and presentation inputs are captured for a session. `metadata` is retained by reference, not deeply cloned. Avoid mutating a metadata object during an active transition.
:::

For recipe-generated `Element`, `Element.Target`, `Enter`, and `Exit`, see [`defineTransition`](./transitions.md#definetransition).

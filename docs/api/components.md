---
title: Components
description: Props and lifecycle behavior for the provider, screen wrapper, and retained shared elements.
---

# Components

Import these from your integration entry unless noted otherwise. The root entry selects React Navigation; `/expo-router` selects Expo Router. Shared components are also available from `/core`.

## `ChoreographyOverlay`

Keeps floating controls mounted and interactive above shared transitions.
Empty space passes touches through, and the app remains accessible to screen readers.

Mount it directly inside `ChoreographyProvider`, alongside the navigator and
outside `ChoreographyScreen`; this placement is required for Android layering.
Position children absolutely and account for safe-area insets.

```tsx
<ChoreographyProvider>
  <NavigationContainer>{/* native stack */}</NavigationContainer>
  <ChoreographyOverlay>
    <View style={{ position: 'absolute', right: 16, bottom: 40 }}>
      <FloatingControls />
    </View>
  </ChoreographyOverlay>
</ChoreographyProvider>
```

| Prop       | Type        | Default / behavior       |
| ---------- | ----------- | ------------------------ |
| `children` | `ReactNode` | Required overlay content |

On iOS, use this wrapper to place app controls above transitions; `zIndex` alone
cannot do that. Native window overlays, including React Native's FPS monitor,
stay above the transition host automatically.

## `ChoreographyProvider`

Coordinates shared transitions, their progress, and the native overlay. Mount one provider above the navigator and keep it mounted as routes change.

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

The provider waits briefly for both screens to finish layout before starting motion. If usable shared-element geometry is unavailable, navigation continues without a shared transition.

Use `ComponentProps` to type a callback defined outside the provider:

```tsx
import type { ComponentProps } from 'react';

type ProviderProps = ComponentProps<typeof ChoreographyProvider>;
const onStart: ProviderProps['onTransitionStart'] = (session) => {
  console.log(session.groupId, session.direction, session.pairs.length);
};
```

Preparation traces help diagnose a delay between navigation and the start of motion. They include the group, source and target screen IDs, direction, outcome, and timed stages from the JavaScript performance clock (`js-performance-now`). Outcomes include `overlay-ready`, `overlay-timeout`, `cancelled`, `unavailable`, and `failed`. Use lifecycle callbacks for session events; traces report startup timing rather than animation duration or frame rate.

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

Object configuration defaults to level `info`. Identical consecutive messages are coalesced unless `logEveryFrame` is `true`.

## `ChoreographyScreen`

Wraps each route participating in shared transitions. It waits for layout, manages the screen's visibility and input during motion, and connects Back navigation to the return transition. Available only from the integration entries.

```ts
{
  screenId: string;
  children: ReactNode;
  ready?: boolean; // default: true
  screenFade?: { during: readonly [number, number] }; // default: [0, 0.4]
  keepVisible?: boolean; // default: false
  allowInteractionDuringTransition?: boolean; // default: true
}
```

Use a stable application label for `screenId`. For React Navigation, match the route name; for Expo Router, match `targetScreenId` on navigation requests. Multiple instances of the same route can use the same label.

`allowInteractionDuringTransition` defaults to `true` on both platforms. The arriving screen can receive touches during motion, so a Back button can interrupt an opening transition. Set it to `false` to block those touches until motion completes. Disable individual controls while transitioning if using them would conflict with your screen's state.

Forward destinations remain blocked during preparation; returning screens can accept queued taps when interaction during transitions is enabled. The outgoing screen is blocked during motion. A screen driving a custom gesture with `useInteractiveTransition` keeps its visibility and input until finish or cancel, so the gesture can continue. Shared content in the overlay cannot receive touches; place a Back button or gesture responder in ordinary destination content.

`ready` adds an application gate after the screen lays out. It does not replace layout readiness. Readiness also waits for acquired blockers. See [readiness](../guide/readiness.md).

`keepVisible` keeps the screen at full opacity during motion. Set it on the source screen when a transparent destination uses the source as its backdrop, such as a preview over a list. It takes precedence over `screenFade`. A forward destination still stays hidden during preparation, and readiness and input behavior remain the same.

Back to the recorded source route uses a shared return transition. Multi-route resets and removals outside that return path use ordinary navigation.

### `ScreenFadeConfig`

The `screenFade` prop controls the decorative opacity of this screen during an active transition. The type is exported from both integration entries and the core entry.

- Omit it to keep the default expansion-progress interval `[0, 0.4]`.
- Pass `{ during: [0.2, 0.7] }` to choose another interval. Both values must be finite and satisfy `0 <= start < end <= 1`.
- Use the separate `keepVisible` prop to keep the screen opaque and choreograph its content yourself.

Expansion progress is `0` at the collapsed screen and `1` at the expanded screen. The expanded screen fades in across the interval; the collapsed screen fades out. Returning traverses the same interval in reverse. Values outside the interval are clamped. These values are progress positions, not elapsed-time fractions.

Each screen configures its own opacity. Use the same interval on both screens for a complementary crossfade. Disabling the fade on one screen does not disable it on the other. A screen's opacity multiplies its children's opacity, so it can limit the visibility of `Enter` and `Exit` content. With fading disabled, an opaque screen background can cover the screen underneath; choose backgrounds and content reveals to suit the design.

An explicitly owned gesture source stays fully visible regardless of the fade interval until finish or cancel.

The fade controls screen opacity during motion. Readiness and input rules still apply, and shared elements animate independently in the overlay.

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

`SharedElementProps` is exported for typing your own wrappers. Keep `id` and `groupId` stable for the same content. Each transition captures endpoint styles and metadata when it starts; later changes to those inputs apply to subsequent transitions. The live child component can continue updating during motion.

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

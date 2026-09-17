---
title: Introduction
description: Bring screens together with one retained element and one shared animation clock.
---

# A transition is more than a moving card.

Screen Choreography coordinates shared elements and companion content across React Native screens. A single Reanimated progress value drives the motion, while a native overlay presents it above the navigator.

## One element, three places

The source screen owns the content. The destination declares an empty target. During a transition, the library moves the owner's native subtree through an overlay and into that target using `react-native-teleport`.

```text
Source owner  →  Native overlay  →  Destination target
                    ↑
            The same live content
```

This retained subtree is useful for content with local state: artwork, controls, media, and composite cards. You do not create a second copy for the destination.

```tsx
// Source: owns the component.
<SharedElement id="artwork" groupId="album.42" style={smallFrame}>
  <Artwork />
</SharedElement>

// Destination: defines its landing place.
<SharedElement.Target
  id="artwork"
  groupId="album.42"
  style={largeFrame}
/>
```

::: tip React ownership stays at the source
The native content changes location, but its React context and component ownership stay with the source. Inside retained content, use [`useSharedElementPresentation`](../api/hooks.md#usesharedelementpresentation) for destination geometry and presentation state. A navigation hook inside that content still belongs to the original route.
:::

## Three concepts to learn

| Concept        | What it does                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Screen**     | `ChoreographyScreen` identifies each route and coordinates layout readiness and visibility.                         |
| **Group**      | A `groupId` selects the elements moving together, such as `album.42`. Matching IDs pair elements within that group. |
| **Transition** | `defineTransition` collects shared motion, local reveals, and navigation timing in one reusable definition.         |

Define motion once, outside component render. Use its `Element` on the source, `Element.Target` on the destination, and pass the same group to navigation.

## One clock for the whole screen

The library's **expansion progress** is always `0` at the collapsed endpoint and `1` at the expanded endpoint. Forward navigation moves from `0 → 1`; back moves from `1 → 0`.

Shared geometry, backdrop opacity, and local reveals can all read that clock. See [transitions](./transitions.md) for declarative recipes and custom renderers.

Custom back gestures expose a separate **gesture progress**: `0` means an untouched detail screen and `1` means a completed back. See [interactive back](./interactive-back.md) before connecting a gesture.

## Where it fits

Use Screen Choreography for coordinated card-to-detail transitions on **iOS and Android with Fabric**. React Navigation's native stack and Expo Router's native stack are the documented integrations.

The current version is pre-1.0, and minor releases may introduce breaking changes. Native-stack swipe progress is not connected automatically; custom gesture control is available through a hook. Shared elements must be mounted and measurable when a session is prepared.

## Start building

Follow [installation](./installation.md), then build a complete two-screen transition in the [quick start](./quick-start.md). For file-based routing, follow the [Expo Router guide](./expo-router.md).

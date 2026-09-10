# Declarative transitions

Define a transition once outside React render and reuse it on both screens. Import
from the entry matching your navigator; the same recipes are also available from
`react-native-screen-choreography/core`.

```tsx
import {
  defineTransition, surface, image, text, crossfade, fade, Springs,
} from 'react-native-screen-choreography';

export const articleTransition = defineTransition({
  motion: { spring: Springs.default },
  shared: {
    surface: surface({ radius: [24, 0] }),
    image: image({ fit: 'cover', radius: [16, 0], zIndex: 1 }),
    title: text({ mode: 'scale-crossfade', zIndex: 2 }),
    description: crossfade({ zIndex: 2 }),
  },
  exit: {
    assets: fade({ during: [0, 0.25], zIndex: 2 }),
    source: fade({ during: [0, 0.35], follow: ['image', 'title'], zIndex: 2 }),
  },
  enter: {
    source: fade({ during: [0.6, 0.9], follow: 'title', zIndex: 2 }),
    controls: fade({ during: [0.35, 0.9], zIndex: 3 }),
  },
});
```

Register the same shared names and group on the collapsed and expanded screens.
Enter-only content belongs on the expanded screen; exit-only content belongs on
the collapsed screen. The library discovers these one-sided participants after
the destination is ready, without placeholder views. Names are type checked.

```tsx
<articleTransition.Element name="title" groupId={`article.${article.id}`}>
  <ArticleTitle>{article.title}</ArticleTitle>
</articleTransition.Element>
```

The wrapper accepts `style`. Fixed-content recipes preserve its padding, borders,
child alignment, and paint at each endpoint; measured geometry supplies outer
position and size, so margins and flex sizing are not applied again in the overlay. Its optional `Element.Target` child selects a nested
measurement target, with the same behavior as `SharedElement.Target`. The group
identifies one item and must match across screens. Reuse one definition within a
group. A name cannot be in both `shared` and `enter`/`exit`; a name can have both
an enter and exit track, with matching z-indices, for independent endpoint copies.

Navigate with the existing adapter and pass the definition's motion options:

```tsx
navigate('Article', { articleId: article.id }, {
  ...articleTransition.navigationOptions,
  transitionConfig: { group: `article.${article.id}` },
});
```

`navigationOptions` contains the optional `spring` and `duration` only. Supply the
group in the adapter's existing request shape. The Expo Router adapter uses the
same options in its object-shaped request. Existing native-stack configuration,
`ChoreographyScreen` readiness, and interactive-back hooks still apply.

## Recipes and rendering

| Recipe | Behavior |
| --- | --- |
| `surface` | Interpolates an empty surface's bounds, radius, and background color. Uses static shadow properties with animated opacity. |
| `image` | Moves fixed endpoint representations inside an animated clip, using uniform cover scaling and crossfading between their crops. |
| `text` | Moves and uniformly scales fixed endpoint layouts, crossfading from 0.3 to 0.65. Does not animate font size, line height, letter spacing, or text layout. |
| `crossfade` | Moves/scales fixed endpoint presentations with configurable `exitDuring` and `enterDuring` ranges. |
| `fade` | Enters or exits fixed-size content. An optional `follow` anchor translates it while preserving its endpoint offset. |

All ranges use semantic expansion progress: **0 is collapsed, 1 is expanded**.
Back and cancelled interactive transitions scrub the same tracks in reverse.
`follow` refers to a shared name; an array chooses the first available pair. If no
listed anchor is mounted and measured, the content fades at its own endpoint.
The anchor contains geometry only, never React content. True shared pairs still
require both endpoints; only explicit enter/exit tracks allow an absent endpoint.

Image blending keeps the lower crop opaque while the upper crop fades in,
avoiding a background-colored dip halfway through the transition.

Text keeps its natural endpoint wrapping. Its crossfade intentionally replaces
continuous reflow, and image crops blend rather than continuously recomputing
intrinsic-image cropping. Inspect these visual choices with your actual content,
including large fonts and different aspect ratios. Image clip frames and empty
surfaces still resize during motion; their content keeps fixed layout dimensions.

Surface `radius: [collapsed, expanded]` overrides endpoint radii. Its `opacity`
accepts `{ input: [...progress], output: [...opacity] }` keyframes. Inputs must be
strictly increasing and all values must be between 0 and 1. `shadow: 'collapsed'`
keeps the collapsed shadow throughout the morph, subject to surface opacity;
`'endpoints'` crossfades static endpoint shadows. No shadow parameters are animated.

An optional `surface({ backdrop: { content, opacity } })` renders full-overlay
content behind the surface with its own opacity track. It can preserve an app's
existing dim or blur view without a custom animated renderer. It still has the
rendering cost of that content; blur performance is platform dependent.

## Content lifetime

These recipes mount endpoint content as overlay presentations. They are **not
native snapshots**, and child effects/subscriptions can still run in those copies.
Use lightweight, presentation-only components where possible. Content can detect
its overlay presentation with `useTransitionPresentation()`, which returns false
in ordinary endpoints and for live content. Use it to select an inert component
that does not call navigation hooks or subscribe to unnecessary data; follow the
Rules of Hooks when selecting components.

The library freezes presentation inputs at session start and owns the visibility
handoff. Existing custom renderers remain available for advanced behavior, and
`SharedElement.Live` remains appropriate for stateful content requiring one owner.
This API does not introduce native snapshot capture or change native handoff timing.

## Validation and performance

The coordinator reuses the final validated target measurement batch when native
refs still match. It retains the existing stability waits, cancellation checks,
and timeout fallback measurement. Tests verify forward/reverse one-sided pairing,
endpoint transforms, anchor fallback, presentation mode, and measurement reuse.
They do not establish a device FPS improvement. Profile preparation, animation,
completion, and interactive cancellation separately on physical devices before
claiming performance gains.

## Single-image crop morph

Use `image({ mode: 'morph', radius: [16, 0] })` when both endpoints show the
same photo. Each element must contain one direct React Native `Image` child
using `resizeMode="cover"`, with the same source and known intrinsic width and
height (bundled assets supply these automatically; remote sources must provide
them). Keep the image filling the measured wrapper. Use the recipe's `overlay`
option for decorations such as a bottom gradient: it renders inside the image
clip and follows the same changing bounds. Render that same decoration in the
ordinary endpoints too.

This mode renders one image with `resizeMode="cover"` filling an animated
rectangle. The rectangle changes position, size, and radius; there are no nested
image transforms. It matches both endpoint cover
crops and retraces the same geometry on Back, without crossfading photos. The
existing default image mode still blends arbitrary endpoint representations.
Overlay image content is newly mounted, not a retained native image instance;
the morph image blocks overlay readiness until `onLoad`. The provider still
retains its bounded 150ms timeout safety net.

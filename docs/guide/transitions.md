---
title: Defining motion
description: Compose shared geometry, local reveals, and custom motion with reusable transition definitions.
---

# Define motion once.

Keep a screen's motion in one module. `defineTransition` gives shared elements and local content named roles, then exposes components that apply those roles consistently.

## Start with a recipe

```tsx
// artworkTransition.ts
import {
  defineTransition,
  Springs,
} from 'react-native-screen-choreography/core';

export const artwork = defineTransition({
  motion: { spring: Springs.default },
  shared: {
    hero: { kind: 'bounds', radius: [24, 32], zIndex: 100 },
    panel: { kind: 'surface', radius: [20, 28], zIndex: 90 },
  },
  enter: {
    title: { during: [0.45, 0.75], translateY: 12 },
    description: { during: [0.6, 0.95], translateY: 20 },
  },
  exit: {
    caption: { during: [0.1, 0.4], translateY: -8 },
  },
});
```

| Recipe    | Use it for                                                                          |
| --------- | ----------------------------------------------------------------------------------- |
| `bounds`  | Position, size, and optional corner radius around retained content                  |
| `surface` | Position and size plus background color, corner radius, and an expanded-side shadow |
| `enter`   | Destination content that fades and translates in as the screen expands              |
| `exit`    | Source content that fades and translates out as the screen expands                  |

The `radius` tuple always means **collapsed, expanded**, including on back. Without it, recipes read the endpoint styles.

## Choose how content changes size

Shared recipes, `TransitionFrame`, and `TransitionSurface` update the frame's width and height during motion, letting text, images, and other live children respond to the available space. Frame position uses translations with a fixed layout origin; content is not scaled to fit.

## Place the endpoints

```tsx
// Source screen
<artwork.Element name="hero" groupId="artwork.42" style={cardStyle}>
  <Artwork />
</artwork.Element>
<artwork.Exit name="caption">
  <Text>Open the collection</Text>
</artwork.Exit>

// Destination screen
<artwork.Element.Target name="hero" groupId="artwork.42" style={heroStyle} />
<artwork.Enter name="title">
  <Text>A closer look</Text>
</artwork.Enter>
```

Each `name` becomes an element ID. Use the same `groupId` on matching endpoints and in `transitionConfig.group`. In a list, use a group per item so each item's `hero` remains distinct.

`Enter` and `Exit` default to ordinary screen content. They remain visible when the screen is idle or unrelated to the current transition. For content inside a retained shared owner, use `scope="presentation"` as shown below.

## Reveal a dynamic list

Define one role, then give each keyed item its index and the current list length:

```tsx
const details = defineTransition({
  enter: {
    row: { during: [0.5, 0.95], stagger: 0.06, translateX: 12, scale: 0.96 },
  },
});

function DetailRows({ items }) {
  return items.map((item, index) => (
    <details.Enter key={item.id} name="row" index={index} count={items.length}>
      <Text>{item.title}</Text>
    </details.Enter>
  ));
}
```

Each reveal owns its hooks, so the list can grow, shrink, or reorder. An empty list renders no reveals. `stagger` is measured in expansion progress, not milliseconds. `during` covers the whole group; excessive staggering compresses to fit, and every item reaches its endpoint by the end of the interval. Index or count changes immediately adjust the intervals. Back reverses the order naturally.

For an existing animated component, call [`useRevealStyle`](../api/hooks.md#userevealstyle) inside each item's component instead.

## Reveal inside retained content

Content moved through a portal keeps the source route's React context. Opt into the owner's progress explicitly:

```tsx
const card = defineTransition({
  shared: { hero: { kind: 'bounds' } },
  enter: { details: { during: [0.4, 0.85], translateY: 16 } },
  exit: { caption: { during: [0.1, 0.35] } },
});

function RetainedCard() {
  return (
    <>
      <card.Exit name="caption" scope="presentation">
        <Text>Tap to explore</Text>
      </card.Exit>
      <card.Enter name="details" scope="presentation">
        <Text>Expanded details</Text>
      </card.Enter>
    </>
  );
}

<card.Element name="hero" groupId="card.42">
  <RetainedCard />
</card.Element>;
```

Presentation reveals use the owner's `presentationProgress`: expanded details stay hidden on collapsed cards, including while another card animates, and the caption stays hidden when expanded. Use `useSharedElementPresentation` for custom geometry or to control mounting, touches, and accessibility. Reveal wrappers keep children mounted and only animate opacity and transforms.

## Apply timing at navigation

```tsx
void navigate(
  'Detail',
  { id: '42' },
  {
    transitionConfig: { group: 'artwork.42' },
    ...artwork.navigationOptions,
  }
);
```

The definition does not launch navigation or apply its timing globally. Spread `navigationOptions` into each navigation request that should use it. `motion.duration` chooses a timing animation instead of a spring; the duration is in milliseconds.

Enter and exit intervals use expansion progress, so they reverse naturally when progress moves from `1 → 0`. Screen-scoped reveals are visible when idle; presentation-scoped reveals retain their endpoint visibility. Their built-in translations and scale respect Reanimated's reduced-motion preference; custom renderers should make their own reduced-motion choices.

## Configure the whole-screen fade

`ChoreographyScreen` also fades the whole screen, independently of the recipe's `Enter` and `Exit` content. Its default interval is `[0, 0.4]` in expansion progress. To change that interval, apply matching settings to the list and detail wrappers:

```tsx
<ChoreographyScreen screenId="Gallery" screenFade={{ during: [0.2, 0.7] }}>
  <GalleryContent />
</ChoreographyScreen>

<ChoreographyScreen screenId="GalleryDetail" screenFade={{ during: [0.2, 0.7] }}>
  <GalleryDetailContent />
</ChoreographyScreen>
```

Use `keepVisible` on each screen whose content you want to choreograph without a parent fade. Preparation still hides the incoming screen until it is ready for the transition, and input blocking remains active. With no screen fade, opaque backgrounds can obscure the underlying screen, so coordinate backgrounds and content visibility in your design.

The interval reverses automatically on Back; there is no separate backward interval. See [`ScreenFadeConfig`](../api/components.md#screenfadeconfig) for details.

## Write a custom renderer

Use `makeTransition` when you need more control than a recipe. The renderer receives frozen endpoint geometry, styles, metadata, and the library-owned live host as `children`.

```tsx
import {
  makeTransition,
  resolveSurfaceStyle,
  TransitionFrame,
  type TransitionRendererProps,
} from 'react-native-screen-choreography/core';

function HeroRenderer({
  source,
  target,
  progress,
  direction,
  zIndex,
  children,
}: TransitionRendererProps) {
  return (
    <TransitionFrame
      sourceMetrics={source.metrics}
      targetMetrics={target.metrics}
      progress={progress}
      direction={direction}
      zIndex={zIndex}
      sourceBorderRadius={resolveSurfaceStyle(source.style).borderRadius}
      targetBorderRadius={resolveSurfaceStyle(target.style).borderRadius}
    >
      {children}
    </TransitionFrame>
  );
}

export const heroTransition = makeTransition({ renderer: HeroRenderer });
```

Reuse `heroTransition` on both `SharedElement` and `SharedElement.Target`, or assign it to a named `shared` recipe in `defineTransition`.

::: warning Render the host exactly once
Always render the supplied `children` exactly once throughout a session. Do not replace it with another copy of your artwork, conditionally remove it, or move it between different renderer branches during the animation.
:::

`progress` is expansion progress. `source` and `target` describe the current navigation direction. If you interpolate their metrics directly, derive `t = direction === 'backward' ? 1 - progress.value : progress.value` in a worklet. `TransitionFrame` and `TransitionSurface` already do this.

## Animate inside the retained content

```tsx
const { presentationProgress } = useSharedElementPresentation();
const labelStyle = useAnimatedStyle(() => ({
  transform: [
    {
      scale: interpolate(
        presentationProgress.value,
        [0, 1],
        [1, 1.25],
        'clamp'
      ),
    },
  ],
}));
```

Import the hook from the library and `useAnimatedStyle` / `interpolate` from Reanimated. Endpoint metrics are `null` before the first transition. Metadata is captured by reference at session start, so pass immutable values and narrow its `unknown` type before reading fields.

For supported props and defaults, see the [transition reference](../api/transitions.md).

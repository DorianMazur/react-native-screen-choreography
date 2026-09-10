# react-native-screen-choreography

Choreographed shared element transitions for React Native with multi-element coordination.

> **Status:** pre-1.0. The public API is converging but minor versions can still introduce breaking changes.

<p align="center">
  <img src="docs/Gallery_demo.gif" width="200" />
  &nbsp;
  <img src="docs/Wallet_demo.gif" width="200" />
</p>

## Overview

This library is built for apps that want more than a single shared element moving between two screens. It coordinates a whole transition session: containers, icons, labels, backdrop dim, progressive content reveal, and interruption handling.

What it provides:

- multi-element shared transitions driven by one progress value
- companion motion hooks for backdrop, reveal timing, and staggered sections
- a native overlay host above native-stack containers for reliable presentation ownership
- safer forward, reverse, and interruption handling than a plain screen animation

## Requirements

- React Native **>= 0.76** with the New Architecture (Fabric) enabled
- React **>= 18**
- `@react-navigation/native` and `@react-navigation/native-stack` **>= 6** (validated on 7.x)
- `react-native-reanimated` **>= 4**
- `react-native-screens` **>= 4**
- `react-native-teleport` **>= 1.2**
- `react-native-worklets` **>= 0.8**

The bare example is validated on React Native 0.83. The Expo Router example is validated on Expo SDK 57. Both use React 19 and Reanimated 4.

## Installation

Install the library and its required peers:

```bash
npm install react-native-screen-choreography
npm install react-native-reanimated react-native-worklets @react-navigation/native @react-navigation/native-stack react-native-screens react-native-teleport
```

Or with Yarn:

```bash
yarn add react-native-screen-choreography
yarn add react-native-reanimated react-native-worklets @react-navigation/native @react-navigation/native-stack react-native-screens react-native-teleport
```

Your Babel setup must include `react-native-worklets/plugin`. The library relies on UI-thread worklets for measurement, scheduling, and transition coordination; without this plugin the runtime will fail when those worklets execute. The example in this repo uses:

```js
plugins: ['react-native-worklets/plugin'];
```

For iOS, install pods after adding the dependency:

```bash
cd ios && pod install
```

Rebuild the native app after upgrading to enable native forward preparation.
It checks mounted destination layout across two native frames, then reads target
coordinates in one batch. An older app binary without the optional preparation
module keeps the existing readiness path. Application `ready` flags and blockers
still control when destination content is ready to animate.

## Choosing An Entry Point

Choose the import path for your navigation setup. Each integration includes the same shared components, transition recipes, progress hooks, utilities, and types.

| Import path | Use case | Navigation-specific exports |
| --- | --- | --- |
| `react-native-screen-choreography` | React Navigation apps | `ChoreographyScreen`, `useChoreographyNavigation`, `useInteractiveTransition` |
| `react-native-screen-choreography/expo-router` | Expo Router apps | `ChoreographyScreen`, `useChoreographyRouter`, `useInteractiveTransition` |
| `react-native-screen-choreography/core` | Shared components that should not select a navigation integration | None |

Most apps only need one of the first two paths. Use `/core` for navigator-independent code, such as a shared component library used by both apps. It does not replace the navigation integration or expose the internal transition engine.

Keep `ChoreographyScreen` and the navigation hooks on the path matching your app. The Expo entry uses Expo Router's public navigation APIs; the root entry uses `@react-navigation/native`.

## Recommended Navigator Setup

The current implementation works best with these native-stack settings:

- `animation: 'none'`
- transparent detail presentation
- transparent detail `contentStyle`

That configuration lets the overlay own the visible transition instead of competing with a screen-level navigator animation.

```tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChoreographyProvider } from 'react-native-screen-choreography';

const Stack = createNativeStackNavigator();

export function App() {
  return (
    <ChoreographyProvider debug={false}>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: 'none',
          }}
        >
          <Stack.Screen name="TokenList" component={TokenListScreen} />
          <Stack.Screen
            name="TokenDetail"
            component={TokenDetailScreen}
            options={{
              presentation: 'containedTransparentModal',
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ChoreographyProvider>
  );
}
```

## Expo Router Setup

Expo Router's native `Stack` uses the same underlying navigation primitives. Keep the provider in the root layout, disable the stack animation, and use a native development build because the package includes a custom native overlay host and cannot run in Expo Go.

```tsx
// src/app/_layout.tsx
import { Stack } from 'expo-router';
import { ChoreographyProvider } from 'react-native-screen-choreography/expo-router';

export default function RootLayout() {
  return (
    <ChoreographyProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </ChoreographyProvider>
  );
}
```

Use the adapter from the `expo-router` subpath. `targetScreenId` must match the destination `ChoreographyScreen`; keeping it explicit supports dynamic routes without placing transition metadata in the URL.

```tsx
import { useRouter } from 'expo-router';
import { useChoreographyRouter } from 'react-native-screen-choreography/expo-router';

const router = useRouter();
const { push } = useChoreographyRouter(router, 'GalleryList');

push({
  href: { pathname: '/gallery/[photoId]', params: { photoId: photo.id } },
  targetScreenId: 'GalleryDetail',
  transitionConfig: { group: `photo.${photo.id}` },
});
```

```tsx
// src/app/gallery/[photoId].tsx
<ChoreographyScreen screenId="GalleryDetail">
  {/** detail content */}
</ChoreographyScreen>
```

The adapter also exposes `navigate()` and `back()`. Normal Expo Router deep links still work, but a choreography starts only when navigation originates from a mounted source element. Automatic progress from Expo Router's built-in native swipe gesture is not connected; use `useInteractiveTransition` for custom gestures.

## Debugging

`ChoreographyProvider` accepts a structured `debug` prop:

```tsx
// off (default)
<ChoreographyProvider debug={false}>

// info / warn / error logs (shortcut)
<ChoreographyProvider debug={true}>

// full structured form
<ChoreographyProvider
  debug={{
    level: 'trace',     // 'error' | 'warn' | 'info' | 'trace'
    logEveryFrame: false, // disable coalescing of repeated lines
  }}
>
```

At `info` you get one line per major lifecycle event (transition start, active, complete, cancel). At `trace` you also get measurement and readiness traces. Identical consecutive log lines are coalesced as `... (×N)` unless you set `logEveryFrame: true`.

You can also toggle the logger imperatively from anywhere via the exported `setDebugEnabled` helper.

## Troubleshooting

| Symptom                                                        | Likely cause                                                                                 | Fix                                                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Blank flash at the start of the animation                      | Overlay host not committed before reals were hidden                                          | Make sure `ChoreographyProvider` is mounted above `NavigationContainer` and the provider is not unmounting between routes  |
| Source card double-renders during animation                    | Stack `animation` is not `'none'`, so the navigator is animating the route under the overlay | Set `screenOptions={{ animation: 'none' }}`                                                                                |
| Detail screen shows opaque background behind the morphing card | Detail route is not transparent                                                              | Use `presentation: 'containedTransparentModal'` and `contentStyle: { backgroundColor: 'transparent' }`                     |
| `Coordinator: No valid pairs found` warning                    | Target `SharedElement` never registered or measured to zero size                             | Make sure the target screen is wrapped in `ChoreographyScreen` and the element is not inside a virtualized off-screen cell |
| Animation runs but elements snap at the end                    | Per-frame style mutation on container shadows                                                | Use `boxShadow` (RN 0.76+) and animate `opacity` instead of `shadowColor`/`elevation`/`shadowRadius` per frame             |
| `[Registry] Replacing duplicate element` warning               | The same `(screenId, groupId, id)` identity mounted twice                                    | Make each `id` unique within its screen and group                                                                          |
| Reverse transition jumps on Android                            | Live re-measurement of the source row was needed but the row was off-screen                  | Keep the source row mounted and visible (avoid scrolling away while a detail is open)                                      |
| Logs are very noisy                                            | `debug={true}` enables `info` level                                                          | Use `debug={false}`, or `debug={{ level: 'warn' }}` for production-style output                                            |

## Quick Start

Every shared element has one mounted owner and an empty receiving target. The
library uses `react-native-teleport` to move the owner's native subtree through
the overlay and into the target. The owner screen must remain mounted while its
content is hosted elsewhere.

Wrap each route in `ChoreographyScreen` with a stable logical `screenId`. On the
list, render the content once:

```tsx
import { SharedElement } from 'react-native-screen-choreography';

<SharedElement id="hero" groupId={`photo.${photo.id}`} style={styles.tile}>
  <PhotoHero photo={photo} />
</SharedElement>
```

On the detail screen, reserve the destination bounds:

```tsx
<SharedElement.Target
  id="hero"
  groupId={`photo.${photo.id}`}
  style={styles.hero}
/>
```

The target has no children. Give both endpoints measurable layout. Intrinsic
owners preserve their measured space while their content is elsewhere; explicit
width/height and flex-height rules remain controlled by the app. If content
must respond to changing bounds, animate it using `useSharedElementPresentation`.

Navigate with the matching group:

```tsx
const { navigate, goBack } = useChoreographyNavigation(navigation);

await navigate('PhotoDetail', { photoId: photo.id }, {
  transitionConfig: { group: `photo.${photo.id}` },
});
// On the detail route:
await goBack();
```

The Expo Router equivalent is `useChoreographyRouter(router, screenId)` from the
`/expo-router` entry; call `push({ href, targetScreenId, transitionConfig })` and
`back()`. Both integrations record the originating route instance for Back.

## Declarative transitions

`defineTransition` names shared roles and companion enter/exit motion in one
module-scoped definition. It uses the same live-only core as `makeTransition`.

```tsx
import { defineTransition, Springs } from 'react-native-screen-choreography';

const photoMotion = defineTransition({
  motion: { spring: Springs.default },
  shared: {
    hero: { kind: 'bounds', radius: [8, 0], zIndex: 2 },
  },
  enter: { details: { during: [0.55, 0.9], translateY: 0 } },
  exit: { caption: { during: [0.1, 0.4] } },
});

// List: the only mounted hero content.
<photoMotion.Element name="hero" groupId="photo.aurora" style={styles.tile}>
  <PhotoHero />
</photoMotion.Element>

// Detail: empty receiving host and ordinary local content.
<photoMotion.Element.Target name="hero" groupId="photo.aurora" style={styles.hero} />
<photoMotion.Enter name="details"><PhotoDetails /></photoMotion.Enter>

await navigate('PhotoDetail', { photoId: 'aurora' }, {
  ...photoMotion.navigationOptions,
  transitionConfig: { group: 'photo.aurora' },
});
```

`Element` and `Element.Target` accept only names declared in `shared` and bind
the same transition automatically. A shared role can use `kind: 'bounds'`,
`kind: 'surface'`, or a custom `Transition` returned by `makeTransition`.
Surface motion includes endpoint colors and shadows. Numeric endpoint radii
are used unless a canonical `[collapsed, expanded]` radius pair is supplied.

`Enter` and `Exit` are ordinary animated views on their own screens; they do not
register unpaired shared elements or copy content into the overlay. `during`
uses increasing expansion progress, and `translateY` is the offset while hidden.
Back reverses these tracks. Preparing uses the requested direction instead of
stale progress from a previous session. Reduced-motion settings suppress reveal
translation while preserving the fade. At idle, mounted content is visible. The screen's
own visibility also applies, so effective opacity includes the screen crossfade.
Use `Exit` for nonshared source content. Enter/Exit read the containing screen
state, so use `useSharedElementPresentation` for motion inside retained content.
Keep these wrappers mounted while
animating. Their role names are independently typed from the shared roles.

`navigationOptions` contains the configured spring/duration; spread it into
Back options too when requesting an explicit duration in both directions.
For layout within the retained component, use `useSharedElementPresentation`.

## Custom motion

Create a transition once, outside render, with `makeTransition`. A renderer
receives frozen endpoint styles, metadata, and metrics plus the shared progress.
Render its supplied `children` exactly once: this is the library-owned portal
host, not a copy of the component.

```tsx
import {
  makeTransition,
  TransitionFrame,
  type TransitionRendererProps,
} from 'react-native-screen-choreography';

function HeroMotion({ source, target, progress, direction, zIndex, children }:
  TransitionRendererProps) {
  return (
    <TransitionFrame
      sourceMetrics={source.metrics}
      targetMetrics={target.metrics}
      progress={progress}
      direction={direction}
      zIndex={zIndex}
    >
      {children}
    </TransitionFrame>
  );
}

const heroTransition = makeTransition({ renderer: HeroMotion });
```

Pass the same transition to the owner and target. `TransitionFrame` interpolates
bounds and optional radii. `TransitionSurface` also interpolates surface colors
and radius; its expanded-side `boxShadow` stays static while opacity animates.
Use `resolveSurfaceStyle` to extract surface properties from a `ViewStyle`.
Do not animate shadow parameters per frame on Android.

### Layout inside the owner

`useSharedElementPresentation()` is available inside the owner subtree. It returns
`progress`, `transitioning`, `settled`, and canonical `collapsed`/`expanded`
endpoints. Endpoint metrics are initially `null`; provide initial layout from
props until a transition has measured both sides.

The shared progress is `0` at the list and `1` at the detail. When no transition
is active, use `settled` to choose the correct endpoint instead of relying on
progress left by another group. The Gallery example demonstrates a single hero
whose image, gradient, icon, and text follow one derived frame.

`metadata` is captured by reference at session start, not deep-cloned. Treat
endpoint metadata as immutable. `portalStyle` controls the owner's native
container; `hostStyle` controls the target's receiving host independently of its
measured wrapper. The retained component keeps its original React context, so
pass destination-specific callbacks explicitly when needed (see Wallet setup).

## Companion content and readiness

`useChoreographyProgress()` exposes progress, screen role, phase, direction,
`backdropStyle`, and `settleTransition()`. Use animated styles for detail content
that appears alongside the shared element. `useLatchedReveal` and
`useStaggeredReveal` provide optional reveal helpers.

For components that only need to settle on interaction,
`useChoreographyControls()` provides a stable `settleTransition` callback:

```tsx
const { settleTransition } = useChoreographyControls();
<ScrollView onScrollBeginDrag={settleTransition}>{children}</ScrollView>;
```

`ChoreographyScreen` accepts `ready`; `useChoreographyBlocker()` provides
reference-counted `acquire()`/release handles for asynchronous preparation.
These gate destination measurement. The overlay does not mount duplicate images
or wait for an overlay image reload. Load necessary content before navigating.

## Interactive Back

`useInteractiveTransition()` prepares a return without popping the route. Its
exposed gesture progress is `0` at the untouched detail and `1` at a completed
back gesture (the inverse of the shared expansion progress).

```tsx
const { beginBack, setProgress, settle } = useInteractiveTransition();
const session = await beginBack();
if (session) {
  setProgress(translationX / screenWidth);
  settle({ velocity: velocityX / screenWidth, threshold: 0.4 });
}
```

`setProgress` is worklet-compatible. `finish()` and `cancel()` support explicit
decisions. Accepted returns keep the outgoing route mounted until the animation
ends, then commit navigation and release the overlay after removal. Cancelling
keeps the route. Native-stack swipe progress is not connected automatically.

## Public API at a glance

| API | Purpose |
| --- | --- |
| `ChoreographyProvider` | Session lifecycle, shared progress, native overlay, debug configuration |
| `ChoreographyScreen` | Route identity, readiness, visibility, and navigation integration |
| `SharedElement` / `SharedElement.Target` | One live owner and its receiving endpoint |
| `defineTransition` | Named shared roles and local enter/exit motion |
| `makeTransition` | Custom motion around the library-owned portal host |
| `TransitionFrame` / `TransitionSurface` | Bounds and surface interpolation |
| `useSharedElementPresentation` | Canonical endpoint data inside retained content |
| `useChoreographyNavigation` / `useChoreographyRouter` | Navigation through the matching integration |
| `useInteractiveTransition` | Controlled return gestures |
| `useChoreographyProgress` / `useChoreographyControls` | Companion motion and settling |
| `useLatchedReveal` / `useStaggeredReveal` | Reveal helpers |
| `useChoreographyBlocker` | Application readiness |
| `Springs` / `Easings` | Animation presets |
| `resolveSurfaceStyle` / `setDebugEnabled` | Styling and logging helpers |

The source of truth for shared exports is `src/entries/core.ts`.

## Known limitations

- Owner screens must remain mounted while their content is hosted elsewhere.
- Startup still depends on endpoint registration, readiness, and measurement.
- Intrinsic placeholder dimensions reflect the last measured owner layout;
  orientation or font-size changes while content is away need application-level
  layout consideration.
- Native-stack swipe progress is not connected automatically.
- Elements use compound route-instance/group/element identities. Ambiguous
  interactive screen-name hints without navigation lineage do not start a transition.

## Further Documentation

- [docs/architecture.md](docs/architecture.md) for the runtime architecture and contributor-level internals
- [docs/performance.md](docs/performance.md) for local benchmark commands, measurement definitions, and CI performance reports
- [examples/react-navigation/README.md](examples/react-navigation/README.md) for the bare React Native example
- [examples/expo-router/README.md](examples/expo-router/README.md) for the Expo Router example

## Example Apps

Both apps share Gallery, Wallet, and Wallet setup, each with a module-scoped
`defineTransition` definition. Retained components handle their own interior
layout; the declarative layer coordinates shared roles and local reveals.

Run the bare React Navigation app:

```bash
cd examples/react-navigation
yarn install
cd ios && pod install && cd ..
yarn ios
# or
yarn android
```

The Expo Router app demonstrates typed file-based navigation to a dynamic detail route. It requires a native development build:

```bash
cd examples/expo-router
yarn ios
# or
yarn android
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

# react-native-screen-choreography

Choreographed shared element transitions for React Native with multi-element coordination, progress-driven companion motion, and a native overlay host above the navigation stack.

<p align="center">
  <em>List row → expanding detail card with continuous icon motion, cross-fading text, backdrop dim, and staged content reveal, all driven by one transition session.</em>
</p>

## Overview

This library is built for apps that want more than a single shared element moving between two screens. It coordinates a whole transition session: containers, icons, labels, backdrop dim, progressive content reveal, and interruption handling.

What it provides:

- multi-element shared transitions driven by one progress value
- companion motion hooks for backdrop, reveal timing, and staggered sections
- a native overlay host above native-stack containers for reliable presentation ownership
- safer forward, reverse, and interruption handling than a plain screen animation

## Requirements

- React Native with the New Architecture enabled
- `@react-navigation/native-stack`
- `react-native-reanimated`
- `react-native-screens`
- `react-native-worklets`

The example app in this repository is currently validated on React Native 0.83, React 19, and Reanimated 4.

## Installation

Install the library and its required peers:

```bash
npm install react-native-screen-choreography
npm install react-native-reanimated react-native-worklets @react-navigation/native @react-navigation/native-stack react-native-screens
```

Or with Yarn:

```bash
yarn add react-native-screen-choreography
yarn add react-native-reanimated react-native-worklets @react-navigation/native @react-navigation/native-stack react-native-screens
```

Your Babel setup must include `react-native-worklets/plugin`. The library relies on UI-thread worklets for measurement, scheduling, and transition coordination; without this plugin the runtime will fail when those worklets execute. The example in this repo uses:

```js
plugins: ['react-native-worklets/plugin']
```

For iOS, install pods after adding the dependency:

```bash
cd ios && pod install
```

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

## Quick Start

### 1. Wrap each screen root

`ChoreographyScreen` gives the library a stable screen identity for registration, readiness, and visibility handoff.

```tsx
import { ChoreographyScreen } from 'react-native-screen-choreography';

function TokenListScreen() {
  return (
    <ChoreographyScreen screenId="TokenList">
      {/** screen content */}
    </ChoreographyScreen>
  );
}
```

### 2. Mark matching shared elements

Use the same `id` and `groupId` on source and target elements. The `groupId` represents one transition session. The `id` represents one element within that session.

```tsx
import { SharedElement } from 'react-native-screen-choreography';

<SharedElement
  id={`token.${token.id}.card`}
  groupId={`token.${token.id}`}
  config={{ animation: 'morph' }}
>
  <View style={styles.card}>
    <SharedElement
      id={`token.${token.id}.icon`}
      groupId={`token.${token.id}`}
      config={{ animation: 'move-resize' }}
    >
      <TokenIcon />
    </SharedElement>

    <SharedElement
      id={`token.${token.id}.name`}
      groupId={`token.${token.id}`}
      config={{ animation: 'move-resize' }}
    >
      <Text>{token.name}</Text>
    </SharedElement>
  </View>
</SharedElement>
```

### 3. Navigate through the choreography hook

`useChoreographyNavigation` pre-measures the source, manages pending target visibility, creates the transition session, and coordinates reverse flows.

```tsx
import { useChoreographyNavigation } from 'react-native-screen-choreography';

function TokenListScreen({ navigation }) {
  const { navigate } = useChoreographyNavigation(navigation);

  return (
    <Pressable
      onPress={() =>
        navigate(
          'TokenDetail',
          { tokenId: token.id },
          {
            transitionConfig: {
              group: `token.${token.id}`,
              elements: [
                { id: `token.${token.id}.card`, animation: 'morph' },
                { id: `token.${token.id}.icon`, animation: 'move-resize' },
                { id: `token.${token.id}.name`, animation: 'move-resize' },
                { id: `token.${token.id}.symbol`, animation: 'move-resize' },
                { id: `token.${token.id}.value`, animation: 'crossfade' },
                { id: `token.${token.id}.change`, animation: 'crossfade' },
              ],
            },
          }
        )
      }
    >
      <TokenRow token={token} />
    </Pressable>
  );
}
```

### 4. Add companion motion on the detail screen

`useChoreographyProgress` exposes the shared progress value and common derived behaviors such as backdrop dim and early settle handling when the user starts interacting before the transition is fully settled. `useProgressRevealStyle` adds a generic fade-and-lift reveal for any supporting content block.

```tsx
import Animated from 'react-native-reanimated';
import {
  useChoreographyProgress,
  useProgressRevealStyle,
  useLatchedReveal,
  useStaggeredReveal,
} from 'react-native-screen-choreography';

function TokenDetailScreen() {
  const { backdropStyle, settleTransition } = useChoreographyProgress();
  const supportingVisualStyle = useProgressRevealStyle();
  const showSections = useLatchedReveal();
  const { getItemStyle } = useStaggeredReveal(4, { stagger: 0.04 });

  return (
    <ScrollView onScrollBeginDrag={settleTransition}>
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <Animated.View style={supportingVisualStyle}>
        <SummaryVisual />
      </Animated.View>
      {showSections ? (
        <Animated.View style={getItemStyle(0)}>
          <SectionOne />
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}
```

## Mental Model

- `ChoreographyProvider` owns the registry, transition coordinator, overlay, and active session state.
- `SharedElement` tags matching source and target elements.
- `useChoreographyNavigation` starts and reverses sessions.
- `useChoreographyProgress` lets the screen react to the active session.
- `useLatchedReveal` and `useStaggeredReveal` help detail screens reveal content without duplicating transition lifecycle code.

## Public API At A Glance

### Components

| Component | Purpose |
| --- | --- |
| `ChoreographyProvider` | Hosts the registry, coordinator, overlay, and native transition host; accepts `debug`, `onTransitionStart`, and `onTransitionEnd` |
| `ChoreographyScreen` | Provides a stable `screenId` for registration and readiness tracking |
| `SharedElement` | Registers one shared element by `id` and `groupId` |

`onTransitionStart(session)` fires when a session becomes active with resolved pairs. `onTransitionEnd(session)` fires after the active session completes or is cancelled, which makes them useful for instrumentation, analytics, or app-level UI coordination.

### Hooks

| Hook | Returns |
| --- | --- |
| `useChoreographyNavigation(navigation)` | `navigate()` and `goBack()` integrated with the transition system |
| `useChoreographyProgress()` | `progress`, `backdropStyle`, `isActive`, `settleTransition()` to snap to the current screen endpoint and complete the session |
| `useProgressRevealStyle(config?)` | Animated style for a generic progress-driven fade-and-lift reveal |
| `useLatchedReveal(config?)` | Boolean gate that opens at a progress threshold and stays visible once revealed |
| `useStaggeredReveal(count, config?)` | `getItemStyle(index)` for staged reveal sections |
| `useChoreography()` | Low-level access to context and the active session |

### Utilities

These are advanced exports rather than the primary app-facing API, but they are part of the public surface today.

| Utility | Purpose |
| --- | --- |
| `measureElement(ref, animatedRef?)` | Measure a single element and normalize screen-space metrics |
| `measureElements(refs, animatedRefs?)` | Measure many elements through the legacy per-element path |
| `measureElementsBatched(entries)` | Batch many measurements through one UI-runtime call; used internally by the coordinator |

### Animation Types

| Type | Typical Use |
| --- | --- |
| `morph` | Card or container bounds, radius, and surface morphing |
| `move-resize` | Icons, avatars, and tightly sized labels that should stay spatially continuous |
| `crossfade` | Text or content that changes layout, size, or meaning between screens |
| `fade-in` | Content that only exists on the target screen |
| `fade-out` | Content that only exists on the source screen |
| `none` | Opt out for a tagged element |

Use `move-resize` when the live source and target elements describe the same visual thing and have reasonably compatible bounds. Use `crossfade` when content reflows heavily between screens or when a continuous transform looks less natural than a handoff.

### Core Transition Config

`SharedElementConfig` and `TransitionConfig` are exported from [src/types.ts](src/types.ts). The main transition input looks like this:

```ts
interface TransitionConfig {
  group: string;
  elements?: Array<{
    id: string;
    role?: string;
    animation?: AnimationType;
    config?: SharedElementConfig;
  }>;
  choreography?: {
    backdrop?: ChoreographyTiming;
    supporting?: ChoreographyTiming;
    content?: ChoreographyTiming;
    [key: string]: ChoreographyTiming | undefined;
  };
  spring?: SpringConfig;
  duration?: number;
}
```

Today the stock runtime actively relies on `animation`, `zIndex`, and `renderStandIn` from `SharedElementConfig`. The exported type also includes `resize`, `align`, `progressOffset`, and per-element timing fields, but those should be treated as reserved or experimental until the default overlay path consumes them.

Likewise, `TransitionConfig.choreography` is part of the exported type surface but the built-in hooks currently use the library's default progress ranges. If you are integrating the library as an app developer, treat that field as forward-looking rather than a stable feature switch today.

## Known Limitations

- The best-supported setup is still `@react-navigation/native-stack` with stack animation disabled.
- Interactive gesture progress is not wired yet.
- Transition startup still depends on live target measurement for structural elements.
- Complex shared content is rendered as overlay stand-ins, not native bitmap snapshots.

See [docs/limitations-and-next-steps.md](docs/limitations-and-next-steps.md) for current constraints, workarounds, and roadmap priorities.

## Further Documentation

- [docs/architecture-plan.md](docs/architecture-plan.md) for the runtime architecture and contributor-level internals
- [docs/limitations-and-next-steps.md](docs/limitations-and-next-steps.md) for support boundaries and planned improvements
- [docs/library-comparison.md](docs/library-comparison.md) for a comparison with other shared transition approaches
- [example/README.md](example/README.md) for the example app setup and files to inspect

## Example App

The example app demonstrates a wallet-style token list to detail transition.

```bash
cd example
yarn install
cd ios && pod install && cd ..
yarn ios
# or
yarn android
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

---
title: Expo Router
description: Connect file-based routes to choreography without adding transition metadata to your URLs.
---

# Expo Router

The Expo Router adapter connects the same transition model to file-based navigation. Import screens and navigation hooks from **`react-native-screen-choreography/expo-router`**.

Use a native development build and complete [installation](./installation.md#expo-router) first. Expo Go cannot load the native host.

## Keep the provider in the root layout

```tsx
// src/app/_layout.tsx
import { Stack } from 'expo-router';
import { ChoreographyProvider } from 'react-native-screen-choreography/expo-router';

export default function RootLayout() {
  return (
    <ChoreographyProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="index" />
        <Stack.Screen
          name="artwork/[id]"
          options={{
            presentation: 'containedTransparentModal',
            contentStyle: { backgroundColor: 'transparent' },
            gestureEnabled: false,
          }}
        />
      </Stack>
    </ChoreographyProvider>
  );
}
```

The detail route uses a transparent native presentation so the overlay can remain visible above the screens. Give your own screen content its desired background.

## Declare the source owner

This small example uses the default bounds transition. Both endpoints use the same element ID and a group derived from the selected artwork.

```tsx
// src/app/index.tsx
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import {
  ChoreographyScreen,
  SharedElement,
  useChoreographyRouter,
} from 'react-native-screen-choreography/expo-router';

export default function Collection() {
  const router = useRouter();
  const { push } = useChoreographyRouter(router, 'Collection');
  const id = 'sunrise';

  return (
    <ChoreographyScreen screenId="Collection">
      <View style={{ flex: 1, padding: 24, paddingTop: 72 }}>
        <Pressable
          onPress={() => {
            void push({
              href: { pathname: '/artwork/[id]', params: { id } },
              targetScreenId: 'ArtworkDetail',
              transitionConfig: { group: `artwork.${id}` },
            });
          }}
        >
          <SharedElement
            id="hero"
            groupId={`artwork.${id}`}
            style={{ height: 220 }}
          >
            <View style={{ flex: 1, backgroundColor: '#D4DFBC', padding: 24 }}>
              <Text style={{ fontSize: 32 }}>Sunrise</Text>
            </View>
          </SharedElement>
        </Pressable>
      </View>
    </ChoreographyScreen>
  );
}
```

## Declare the destination target

```tsx
// src/app/artwork/[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, View } from 'react-native';
import {
  ChoreographyScreen,
  SharedElement,
  useChoreographyRouter,
} from 'react-native-screen-choreography/expo-router';

export default function ArtworkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { back } = useChoreographyRouter(router, 'ArtworkDetail');

  return (
    <ChoreographyScreen screenId="ArtworkDetail">
      <View
        style={{
          flex: 1,
          backgroundColor: '#F5F2EC',
          padding: 24,
          paddingTop: 72,
        }}
      >
        <Button
          title="Back"
          onPress={() => {
            void back();
          }}
        />
        <SharedElement.Target
          id="hero"
          groupId={`artwork.${id}`}
          style={{ height: 380 }}
        />
      </View>
    </ChoreographyScreen>
  );
}
```

`targetScreenId` must match the destination wrapper's `screenId`. It is an application label, separate from the URL; the adapter resolves the mounted route instance internally. Transition lineage stays in the provider rather than private URL parameters.

## Push, navigate, and back

`push(request)` and `navigate(request)` accept the same choreography options and preserve their corresponding Expo Router operation. `back()` requests reverse navigation. See the [navigation reference](../api/navigation.md#usechoreographyrouter) for signatures.

::: warning Design a direct-entry state
A deep link has no mounted source owner to move. The empty target in this minimal example will therefore have no artwork on a direct entry. Production detail screens should render their normal standalone content when entered without a source transition, based on explicit application state. Do not mount that fallback and a retained owner for the same transition.
:::

Built-in native swipe progress is not connected automatically. The Expo entry exports [`useInteractiveTransition`](./interactive-back.md) for your own back gesture.

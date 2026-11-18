---
title: Expo Router
description: Add shared transitions to file-based routes in an Expo development build.
---

# Expo Router

The Expo Router adapter connects the same transition model to file-based navigation. Import screens and navigation hooks from **`react-native-screen-choreography/expo-router`**.

Use a native development build and complete [installation](./installation.md#expo-router) first. Expo Go cannot load the native host.

## Keep the provider in the root layout

```tsx
// src/app/_layout.tsx
import { Stack } from 'expo-router';
import {
  ChoreographyProvider,
  choreographyScreenLayout,
  choreographyStackOptions,
} from 'react-native-screen-choreography/expo-router';

export default function RootLayout() {
  return (
    <ChoreographyProvider>
      <Stack
        screenOptions={{ headerShown: false }}
        screenLayout={choreographyScreenLayout}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="artwork/[id]" options={choreographyStackOptions} />
      </Stack>
    </ChoreographyProvider>
  );
}
```

The detail route uses a transparent native presentation so the overlay can remain visible above the screens. Give your own screen content its desired background.

## Declare the source owner

This small example uses the default bounds transition. The pressed owner supplies the group for its navigation request.

```tsx
// src/app/index.tsx
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import {
  SharedElement,
  useChoreographyRouter,
} from 'react-native-screen-choreography/expo-router';

export default function Collection() {
  const router = useRouter();
  const { push } = useChoreographyRouter(router);
  const id = 'sunrise';

  return (
    <View style={{ flex: 1, padding: 24, paddingTop: 72 }}>
      <SharedElement.Pressable
        id="hero"
        groupId={`artwork.${id}`}
        style={{ height: 220 }}
        accessibilityRole="button"
        accessibilityLabel="Open Sunrise artwork"
        onPress={(options) =>
          push({
            href: { pathname: '/artwork/[id]', params: { id } },
            ...options,
          })
        }
      >
        <View style={{ flex: 1, backgroundColor: '#D4DFBC', padding: 24 }}>
          <Text style={{ fontSize: 32 }}>Sunrise</Text>
        </View>
      </SharedElement.Pressable>
    </View>
  );
}
```

## Declare the destination target

```tsx
// src/app/artwork/[id].tsx
import { useRouter } from 'expo-router';
import { Button, View } from 'react-native';
import {
  SharedElement,
  useChoreographyRouter,
} from 'react-native-screen-choreography/expo-router';

export default function ArtworkDetail() {
  const router = useRouter();
  const { back } = useChoreographyRouter(router);

  return (
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
      <SharedElement.Target id="hero" fromSource style={{ height: 380 }} />
    </View>
  );
}
```

The root stack declares `artwork/[id]`, which exactly matches the request's pathname after the leading slash. For a concrete URL such as `/artwork/sunrise`, a nested layout, or a custom screen label, pass `targetScreenId` explicitly. Use the destination's route name or its explicit `screenId`. The group stays out of the URL.

## Push, navigate, and back

`push(request)` and `navigate(request)` accept the same choreography options and preserve their corresponding Expo Router operation. `back()` requests reverse navigation. See the [navigation reference](../api/navigation.md#usechoreographyrouter) for signatures.

::: warning Design a direct-entry state
A deep link has no mounted source owner to move. The empty target in this minimal example will therefore have no artwork on a direct entry. Production detail screens should render their normal standalone content when entered without a source transition, based on explicit application state. Do not mount that fallback and a retained owner for the same transition.
:::

Built-in native swipe progress is not connected automatically. The Expo entry exports [`useInteractiveTransition`](./interactive-back.md) for your own back gesture.

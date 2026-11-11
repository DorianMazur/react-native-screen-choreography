---
title: Quick start
description: Build a complete card-to-detail transition with React Navigation and one live shared element.
---

# Your first transition

Build a card that expands into a detail screen, then returns to its original place. The artwork is mounted once, on the source screen.

Complete [installation](./installation.md) first. This example uses React Navigation's native stack. For Expo Router, use the [routing guide](./expo-router.md).

## A complete two-screen app

Place this in your app's `App.tsx`. The example draws its own artwork, so there are no image assets to download.

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ChoreographyProvider,
  choreographyScreenLayout,
  choreographyStackOptions,
  defineTransition,
  useChoreographyNavigation,
} from 'react-native-screen-choreography';

type Routes = { Gallery: undefined; Detail: undefined };
const Stack = createNativeStackNavigator<Routes>();

// Define once. Both endpoints reuse this definition.
const artwork = defineTransition({
  shared: { hero: { kind: 'bounds', radius: [24, 32] } },
  enter: { description: { during: [0.55, 0.9], translateY: 16 } },
});

function GalleryScreen({
  navigation,
}: NativeStackScreenProps<Routes, 'Gallery'>) {
  const { navigate } = useChoreographyNavigation(navigation);

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.eyebrow}>THE DAILY COLLECTION</Text>
      <Text style={styles.title}>A little more light.</Text>
      <artwork.Element.Pressable
        name="hero"
        groupId="artwork.sunrise"
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel="Open Sunrise artwork"
        onPress={(options) => navigate('Detail', undefined, options)}
      >
        <View style={styles.art}>
          <View style={styles.sun} />
          <Text style={styles.artTitle}>Sunrise</Text>
        </View>
      </artwork.Element.Pressable>
      <Text style={styles.body}>Tap the card to explore.</Text>
    </SafeAreaView>
  );
}

function DetailScreen({
  navigation,
}: NativeStackScreenProps<Routes, 'Detail'>) {
  const { goBack } = useChoreographyNavigation(navigation);

  return (
    <SafeAreaView style={styles.screen}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to gallery"
        onPress={() => {
          void goBack();
        }}
        style={styles.back}
      >
        <Text style={styles.link}>← Gallery</Text>
      </Pressable>
      <artwork.Element.Target name="hero" fromSource style={styles.hero} />
      <artwork.Enter name="description">
        <Text style={styles.title}>Keep the feeling.</Text>
        <Text style={styles.body}>
          One live artwork, carried from the collection into a closer view.
        </Text>
      </artwork.Enter>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ChoreographyProvider>
        <NavigationContainer>
          <Stack.Navigator
            screenLayout={choreographyScreenLayout}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Gallery" component={GalleryScreen} />
            <Stack.Screen
              name="Detail"
              component={DetailScreen}
              options={choreographyStackOptions}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ChoreographyProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F2EC', padding: 24 },
  eyebrow: { fontSize: 11, letterSpacing: 2, color: '#737165', marginTop: 20 },
  title: {
    fontSize: 30,
    fontWeight: '600',
    color: '#242A24',
    marginVertical: 20,
  },
  body: { fontSize: 16, lineHeight: 25, color: '#686C61', marginTop: 16 },
  card: { width: '100%', height: 230, borderRadius: 24, overflow: 'hidden' },
  hero: { width: '100%', height: 370, borderRadius: 32, overflow: 'hidden' },
  art: {
    flex: 1,
    backgroundColor: '#D4DFBC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sun: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#F9AA5C',
  },
  artTitle: {
    marginTop: 18,
    fontSize: 24,
    fontWeight: '500',
    color: '#344332',
  },
  back: { alignSelf: 'flex-start', paddingVertical: 16, marginBottom: 8 },
  link: { fontSize: 16, color: '#344332' },
});
```

## What makes it work

The provider stays mounted above the navigator. `screenLayout` wraps each route and uses its route key to distinguish separate visits to Detail. The detail preset gives the overlay a transparent presentation, disables the native animation, and disables the native swipe gesture.

The pressable registers the `hero` owner and gives its group and motion settings to `navigate`. The matching target receives the group through `fromSource`. Give the empty target a height so it can be measured before the artwork arrives. The detail's `Enter` wrapper follows expansion progress and reverses on Back.

## Next steps

Add more named elements in [transitions](./transitions.md), hold preparation for asynchronous layout with [readiness](./readiness.md), or look up the exact props in the [component reference](../api/components.md).

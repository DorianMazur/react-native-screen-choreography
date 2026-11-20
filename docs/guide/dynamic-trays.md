---
title: Dynamic trays
description: Build a bottom sheet that resizes as you move between views.
---

# Build a dynamic tray

A tray holds several views inside one bottom sheet. Moving between them resizes the sheet and crossfades the content. Back restores the previous view, including form values and scroll position.

The navigator uses Software Mansion's native bottom sheet. Each tray is a nested navigator in your app’s navigation tree.

## Try the example flows

Both example apps include two trays under **Dynamic trays** on the home screen:

- **Wallet dynamic tray:** enter a demo payment, choose a recipient in a full-screen view, then review it. Back restores the form so you can keep editing.
- **Gallery dynamic tray:** open **Explore Plus** to move a shared photo composition into benefits and plan selection. Visit **Good to know** and return to keep your selected plan. **Preview Plus** shows that plan without making a purchase.

Closing a tray resets its local flow. See the [example apps](../examples.md) for setup.

## Install

Follow the [installation guide](./installation.md) and rebuild the native app.

## Define your screens

Create the tray and screen components outside render. This example lets someone write a note, preview it, and go Back to edit it:

```tsx
import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import {
  createTrayNavigator,
  type TrayScreenProps,
} from 'react-native-screen-choreography/tray';

type Routes = {
  note: undefined;
  preview: { text: string };
};

export const Tray = createTrayNavigator<Routes>();

function Note({ navigation }: TrayScreenProps<Routes, 'note'>) {
  const [text, setText] = useState('');
  return (
    <View style={{ padding: 24 }}>
      <TextInput
        accessibilityLabel="Note"
        value={text}
        onChangeText={setText}
      />
      <Button
        title="Preview"
        onPress={() => navigation.push('preview', { text })}
      />
    </View>
  );
}

function Preview({ route }: TrayScreenProps<Routes, 'preview'>) {
  return <Text style={{ padding: 24 }}>{route.params.text}</Text>;
}
```

## Register the tray as a route

Use `trayStackLayout` on a parent stack containing your app screen and its tray routes. The app screen can be your existing native navigator. The sheet stays mounted through its closing animation, and the underlying screen can receive the next tap or drag as soon as the overlay is removed. Wrap the app in `KeyboardProvider` from `react-native-keyboard-controller`.

```tsx
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { trayStackLayout } from 'react-native-screen-choreography/tray';

type AppRoutes = {
  Home: undefined;
  Notes: NavigatorScreenParams<Routes> | undefined;
};
const AppStack = createNativeStackNavigator<AppRoutes>();

function Notes() {
  return (
    <Tray.Navigator initialRouteName="note">
      <Tray.Screen
        name="note"
        component={Note}
        options={{ title: 'Write a note' }}
      />
      <Tray.Screen
        name="preview"
        component={Preview}
        options={{ title: 'Preview' }}
      />
    </Tray.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator layout={trayStackLayout}>
      <AppStack.Screen name="Home" component={Home} />
      <AppStack.Screen name="Notes" component={Notes} />
    </AppStack.Navigator>
  );
}
```

Render `AppNavigator` inside your app's `NavigationContainer`. In Expo Router, use `trayStackLayout` from `react-native-screen-choreography/expo-router/tray` on the root `<Stack layout={trayStackLayout}>`. Place your regular screens in an `(app)` route group with their own stack and give each tray a route directory alongside that group. In its `_layout.tsx`, wrap `createTrayNavigator().Navigator` with Expo Router’s `withLayoutContext` and declare a route file for each tray page. Set the root layout's `unstable_settings.anchor` to `'(app)'` so a tray opened by URL has a screen to return to.

## Open, navigate, and close

Open the sheet with `navigation.navigate('Notes')` from Home. Inside the tray, use `navigation.push('preview', { text })`, `navigation.replace(...)`, `navigation.goBack()`, and `navigation.popToTop()`. Back at the first tray screen returns to the screen underneath. Use `useTrayDismiss()` inside any tray page to close the whole flow.

The parent navigation state includes the focused tray route, so app navigation listeners and configured links can identify it. For example, link `Notes.preview` to `notes/preview/:text` in the parent's nested linking config. Configure `Home` as the parent linking config's `initialRouteName` to supply a return screen on cold launch.

### Migrating from createTray

Replace `createTray()` and its app-level `Tray.Provider` with `createTrayNavigator()` mounted on a parent stack route. Move `Tray.Stack` props to `Tray.Navigator`. Replace `tray.present()` with navigation to the parent route, and read the usual screen `navigation` and `route` props. Use React Navigation's `useNavigationState` and `useFocusEffect` for route state and focus. For autofocus after motion finishes, use `useTraySettled()`.

## Respond to opening and closing

Use lifecycle callbacks on `Tray.Navigator` for work tied to the whole tray:

```tsx
<Tray.Navigator
  onWillPresent={() => analytics.track('tray_opening')}
  onPresent={() => analytics.track('tray_opened')}
  onWillDismiss={() => analytics.track('tray_closing')}
  onDismiss={() => analytics.track('tray_closed')}
>
  <Tray.Screen name="note" component={Note} />
  <Tray.Screen name="preview" component={Preview} />
</Tray.Navigator>
```

Here, `analytics` is your app's analytics client. `onPresent` waits for the native opening animation to settle; `onDismiss` waits for closing to settle and the tray content to unmount. The `onWill…` callbacks report accepted opening or closing on the JavaScript thread and cannot block the animation.

These callbacks cover buttons, backdrop taps, and gestures. `onWillDismiss` fires when a drag commits to closing, not when the finger first moves. If closing is interrupted by dragging back open, `onDismiss` does not fire. Dismissing before opening settles skips `onPresent`. Unmounting the navigator does not fire dismissal callbacks.

Navigating between tray screens does not start another presentation. Use `useFocusEffect` for individual screens. Observe the parent route for whole-tray navigation state.

## Run work while a screen is focused

Retained screens stay mounted when another tray screen covers them. Use React Navigation’s `useFocusEffect` for subscriptions or refreshes that should run only while a screen is current. It also works in child components and custom header components, without passing a route key.

For a wallet screen, subscribe to balance updates on focus and unsubscribe on blur. In this example, `subscribeToBalance` is your app's data source and returns an unsubscribe function:

```tsx
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { subscribeToBalance } from './wallet-store';

function Balance({ accountId }: { accountId: string }) {
  const [balance, setBalance] = useState<string>();

  useFocusEffect(
    useCallback(() => {
      return subscribeToBalance(accountId, setBalance);
    }, [accountId])
  );

  return <Text>{balance ?? 'Loading balance…'}</Text>;
}
```

Render `Balance` inside a tray screen. Back starts the subscription again without resetting the screen's state. Changing `accountId` while focused cleans up the old subscription and starts the new one. Keep the callback memoized with `useCallback` to avoid restarting it on unrelated renders.

Focus follows the navigation tree, including when a parent screen covers the tray. For work that also needs the sheet and page transition to settle, see [focus an input after the transition](#focus-an-input-after-the-transition).

## Expand to full screen

Give a screen more room with `presentation: 'fullScreen'`:

```tsx
<Tray.Screen
  name="preview"
  component={Preview}
  options={{ title: 'Preview', presentation: 'fullScreen' }}
/>
```

The sheet expands to fill the available window, keeping the supplied safe-area insets inside it. Returning to a normal screen shrinks it back to that screen's content.

Full-screen sizing is chosen per screen. Dragging down still dismisses the tray.

## Use a custom header

Use `renderHeader` to replace the title and buttons together. Its props include the current route, title, Back availability, text color, and stable tray actions:

```tsx
import { Pressable, Text, View } from 'react-native';
import type { TrayHeaderProps } from 'react-native-screen-choreography/tray';

function NoteHeader({
  title,
  canGoBack,
  navigation,
  dismiss,
  color,
}: TrayHeaderProps) {
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Text accessibilityRole="header" style={{ color, fontSize: 24 }}>
        {title}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {canGoBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back in tray"
            onPress={navigation.goBack}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color }}>Back</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close tray"
          onPress={dismiss}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color }}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

<Tray.Navigator
  renderHeader={(props) => <NoteHeader {...props} />}
  handleVisible={false}
>
  <Tray.Screen
    name="note"
    component={Note}
    options={{ title: 'Write a note' }}
  />
  <Tray.Screen
    name="preview"
    component={Preview}
    options={{ renderHeader: () => null }}
  />
</Tray.Navigator>;
```

The tray measures your header automatically, including changes in its height, and crossfades headers with the screen transition. This also works for shared transitions, Back, and transitions to or from a hidden header. The outgoing header keeps its state until the transition settles, then unmounts; returning mounts it again. Only the current header accepts touches and is exposed to accessibility. Your header owns its buttons and accessibility labels.

Set `handleVisible={false}` on the stack to remove the drag indicator and its spacing. You can override either setting in a screen's `options`. Dragging to dismiss, tapping the backdrop, and Android Back continue to work. Returning `null` removes only the header; combine it with `handleVisible: false` for content without either element.

## Change the appearance and motion

Configure shared styling once on `Tray.Navigator`. Use `appearance="floating"` (the default) for an inset card or `appearance="sheet"` for a sheet attached to the bottom edge.

```tsx
<Tray.Navigator
  backgroundColor="#23252b"
  textColor="#f4f5f7"
  animation={{ type: 'spring', stiffness: 300, damping: 30 }}
>
  <Tray.Screen name="note" component={Note} />
  <Tray.Screen name="preview" component={Preview} />
</Tray.Navigator>
```

For a fixed duration:

```tsx
animation={{ type: 'timing', duration: 300 }}
```

The default is 240 ms with cubic ease-out. These settings control transitions between screens, including shared elements and resizing, and respect system Reduce Motion. Opening and dismissal use the native sheet's motion; keyboard movement follows the system keyboard.

## Forms and scrolling

Use normal React Native inputs and scroll views. The tray moves with the keyboard. For scrolling forms, use `keyboardShouldPersistTaps="handled"` so buttons work while typing.

Navigating between screens dismisses the keyboard. Back preserves the form values and scroll position. To focus an input when returning, use [an effect that waits for the transition](#focus-an-input-after-the-transition).

A root `ScrollView` fits within the available height. For short, content-sized screens, avoid `flex: 1` on a non-scrollable root.

Previous screens stay mounted for Back, so their effects and subscriptions remain active. Closing the tray resets its screens. Keep drafts outside the tray if they should survive reopening.

### Center a form and keep its action above the keyboard

For a form that fills the window, declare `presentation: 'fullScreen'`. Its content viewport resizes with every keyboard frame, including interactive dismissal. A flex layout can keep the fields centered and the action at the bottom:

```tsx
import { useState } from 'react';
import { Button, ScrollView, TextInput, View } from 'react-native';

function FullScreenNote({ navigation }: TrayScreenProps<Routes, 'note'>) {
  const [text, setText] = useState('');
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <TextInput
          accessibilityLabel="Note"
          value={text}
          onChangeText={setText}
        />
      </ScrollView>
      <View style={{ padding: 24 }}>
        <Button
          title="Preview"
          onPress={() => navigation.push('preview', { text })}
        />
      </View>
    </View>
  );
}

<Tray.Screen
  name="note"
  component={FullScreenNote}
  options={{ title: 'Write a note', presentation: 'fullScreen' }}
/>;
```

The footer follows the keyboard through the tray's own resizing. The stack also handles the bottom safe-area inset. Keep keyboard-height padding, `KeyboardAvoidingView`, `KeyboardStickyView`, and automatic keyboard insets off this layout: adding a second keyboard offset would move the content twice. Normal design padding, such as the 24 points above, still applies.

### Fade supporting content while typing

Read `useTrayKeyboard()` inside a tray screen or custom header to use the same keyboard signal that moves the tray. `progress` and `height` are Reanimated shared values; use them in worklets. `isVisible` is a React boolean for touches and accessibility:

```tsx
import { Text } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useTrayKeyboard } from 'react-native-screen-choreography/tray';

function NoteHelp() {
  const { progress, isVisible } = useTrayKeyboard();
  const fade = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));

  return (
    <Animated.View
      style={fade}
      pointerEvents={isVisible ? 'none' : 'auto'}
      accessibilityElementsHidden={isVisible}
      importantForAccessibility={isVisible ? 'no-hide-descendants' : 'auto'}
    >
      <Text>Your draft stays here when you go back.</Text>
    </Animated.View>
  );
}
```

Place `NoteHelp` below the input. Changing opacity preserves its layout space. `isVisible` becomes true when opening starts and stays true until the keyboard is fully hidden, so faded content is also unavailable to screen readers. Keyboard frames update the shared values without rerendering the component; React updates only when visibility changes.

### Focus an input after the transition

Use `useTraySettled()` to focus after the screen has arrived. For example, replace `Note` with this component:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useTraySettled } from 'react-native-screen-choreography/tray';
import { Button, TextInput, View } from 'react-native';

function Note({ navigation }: TrayScreenProps<Routes, 'note'>) {
  const input = useRef<TextInput>(null);
  const [text, setText] = useState('');

  const settled = useTraySettled();
  useEffect(() => {
    if (settled) input.current?.focus();
  }, [settled]);

  return (
    <View style={{ padding: 24 }}>
      <TextInput
        ref={input}
        accessibilityLabel="Note"
        value={text}
        onChangeText={setText}
      />
      <Button
        title="Preview"
        onPress={() => navigation.push('preview', { text })}
      />
    </View>
  );
}
```

This waits for the native sheet to settle open and for screen navigation to finish, including shared-element handoff. It works with timing animations, springs, Reduce Motion, and Back; no duration or timer is needed. Queued navigation runs before the effect, so an intermediate screen does not steal focus. Closing or leaving the screen skips a pending callback and cleans up an already-running effect. A cancelled dismissal can run the effect again after the tray settles open.

## Anchor content during resizing

Content stays anchored to the bottom by default while the card grows or shrinks between screens. Set `anchor="top"` on the stack to keep content attached to the top instead:

```tsx
<Tray.Navigator anchor="top">
  <Tray.Screen name="note" component={Note} />
  <Tray.Screen name="preview" component={Preview} />
</Tray.Navigator>
```

With the default `"bottom"` anchor, both incoming and outgoing content follow the bottom edge, including on Back and shared transitions. The header stays at the top. Content keeps its natural height and scroll position; taller content is revealed as the card expands.

To override the stack for one screen, set `anchor` to `'top'` or `'bottom'` in its `Tray.Screen` options. Each screen keeps its own anchor while entering and leaving.

## Multiple trays

Register each flow as its own parent stack route. Each mounted tray navigator has its own history, options and sheet lifecycle.

## Keep artwork attached to a resizing tray

Provide `renderContentHeader` on the navigator and set `contentHeaderHeight` on the pages that show the artwork. The navigator keeps the header mounted across those pages, clips it to the interpolated height, and gives each page the remaining space to scroll. The Gallery Plus example uses the supplied Reanimated progress to fold the postcards as the tray opens. The buttons belong to their respective routes.

## Match elements on separate pages

Each tray page supplies a Reanimated shared transition boundary. Give both endpoints the same Reanimated `sharedTransitionTag`, such as the Wallet recipient avatar. Each page owns its own component and state. In a moving native sheet, the shared element can briefly appear outside its expected position. For artwork that should move with the sheet throughout a resize, use the content header.

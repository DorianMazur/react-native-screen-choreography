---
title: Dynamic trays
description: Build a bottom sheet that resizes as you move between views.
---

# Build a dynamic tray

A tray holds several views inside one bottom sheet. Moving between them resizes the sheet and crossfades the content. Back restores the previous view, including form values and scroll position.

The optional `/tray` entry uses Software Mansion's native bottom sheet. It works alongside your app's navigation without adding another navigation library.

## Try the example flows

Both example apps include two trays under **Dynamic trays** on the home screen:

- **Wallet dynamic tray:** enter a demo payment, choose a recipient in a full-screen view, then review it. Back restores the form so you can keep editing.
- **Gallery dynamic tray:** open **Explore Plus** to move a shared photo composition into benefits and plan selection. Visit **Good to know** and return to keep your selected plan. **Preview Plus** shows that plan without making a purchase.

These flows use the same dark surfaces, photo treatments, and typography as the screen demos. Closing a tray resets its local flow. See [example apps](../examples.md) for setup and source links.

## Install

Follow the [tray installation](./installation.md#dynamic-trays-without-a-router), which includes these optional dependencies:

```sh
npm install @swmansion/react-native-bottom-sheet@0.16.2 react-native-keyboard-controller@^1.22.7
```

These packages are required only for trays. Apps using the main, `/core`, or `/expo-router` entry without trays don't need either one.

Install iOS pods and rebuild the native app. Expo requires a development build.

## Define your screens

Create the tray and screen components outside render. This example lets someone write a note, preview it, and go Back to edit it:

```tsx
import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import {
  createTray,
  type TrayScreenProps,
} from 'react-native-screen-choreography/tray';

type Routes = {
  note: undefined;
  preview: { text: string };
};

export const Tray = createTray<Routes>();

function Note({ tray }: TrayScreenProps<Routes, 'note'>) {
  const [text, setText] = useState('');
  return (
    <View style={{ padding: 24 }}>
      <TextInput
        accessibilityLabel="Note"
        value={text}
        onChangeText={setText}
      />
      <Button title="Preview" onPress={() => tray.push('preview', { text })} />
    </View>
  );
}

function Preview({ route }: TrayScreenProps<Routes, 'preview'>) {
  return <Text style={{ padding: 24 }}>{route.params.text}</Text>;
}
```

## Add the provider

Place the provider in your root layout or around the feature that uses it, outside `ChoreographyScreen` wrappers. Declare the screens in `Tray.Stack`:

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function NoteTrayProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Tray.Provider>
      {children}
      <Tray.Stack topInset={insets.top + 12} bottomInset={insets.bottom}>
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
      </Tray.Stack>
    </Tray.Provider>
  );
}
```

Wrap the tray provider with `KeyboardProvider` so the sheet moves with the keyboard. This example also uses `SafeAreaProvider` for the screen insets. Reuse these providers if your app already has them; no `BottomSheetProvider` is needed.

```tsx
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <NoteTrayProvider>
          <OpenNoteButton />
        </NoteTrayProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
```

In an existing app, place your navigation or Expo Router layout where `OpenNoteButton` appears above.

## Open, navigate, and close

Use `Tray.useTray()` anywhere inside the provider. Screens also receive the same API through their `tray` prop:

```tsx
function OpenNoteButton() {
  const tray = Tray.useTray();
  return <Button title="Write a note" onPress={() => tray.present('note')} />;
}
```

| Method                  | Behavior                                         |
| ----------------------- | ------------------------------------------------ |
| `present(name, params)` | Open a fresh stack at this screen.               |
| `push(name, params)`    | Add a screen, keeping previous screens for Back. |
| `replace(name, params)` | Replace the current screen.                      |
| `back()`                | Go back one screen, or close at the root.        |
| `popToRoot()`           | Return to the first screen.                      |
| `dismiss()`             | Close the whole tray.                            |

Use `useTrayState` when your UI needs to react to tray state:

```tsx
const isPresented = Tray.useTrayState((state) => state.isPresented);
```

You can also select `state.route` or `state.depth`. Components update only when their selected value changes; `useTray()` alone doesn't subscribe to changes.

Close, tapping the backdrop, and dragging down dismiss the whole tray. Android Back closes the keyboard first, then goes back through the stack. Use `onDismiss` on `Tray.Stack` to run work after the sheet has closed.

Call `push` directly from the screen's `tray` prop or its own `useTray()` hook. The library ignores duplicate pushes while opening or navigating and allows retry after cancellation. If you tap a destination on a returning screen while Back or `popToRoot()` is still animating, that first push runs automatically after the return finishes. No second tap, persistent `pushing` ref, or focus-reset effect is needed; cancellation can leave the source focused throughout.

::: warning Migration from 0.8.1
Duplicate pushes made while busy are ignored. `push(A); push(B)` accepts A and discards B, and `present(A); push(B)` does not queue B during opening. A returning screen's first push can wait for Back to finish. Remove application-owned duplicate-push guards and their reset effects.
:::

## Respond to opening and closing

Use lifecycle callbacks on `Tray.Stack` for work tied to the whole tray:

```tsx
<Tray.Stack
  onWillPresent={() => analytics.track('tray_opening')}
  onPresent={() => analytics.track('tray_opened')}
  onWillDismiss={() => analytics.track('tray_closing')}
  onDismiss={() => analytics.track('tray_closed')}
>
  <Tray.Screen name="note" component={Note} />
  <Tray.Screen name="preview" component={Preview} />
</Tray.Stack>
```

Here, `analytics` is your app's analytics client. `onPresent` waits for the native opening animation to settle; `onDismiss` waits for closing to settle and the tray content to unmount. The `onWill…` callbacks report accepted opening or closing on the JavaScript thread and cannot block the animation.

These callbacks cover buttons, backdrop taps, and gestures. `onWillDismiss` fires when a drag commits to closing, not when the finger first moves. If closing is interrupted by dragging back open, `onDismiss` does not fire. Dismissing before opening settles skips `onPresent`. Unmounting the provider does not fire dismissal callbacks.

Navigating between tray screens does not start another presentation. Use `useFocusEffect` for individual screens. Use `useTrayState((state) => state.isPresented)` for UI that stays active throughout opening, open, and closing; it cannot distinguish those phases.

## Run work while a screen is focused

Retained screens stay mounted when another tray screen covers them. Use `Tray.useFocusEffect` for subscriptions or refreshes that should run only while a screen is current. It also works in child components and custom header components, without passing a route key.

For a wallet screen, subscribe to balance updates on focus and unsubscribe on blur. In this example, `subscribeToBalance` is your app's data source and returns an unsubscribe function:

```tsx
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { subscribeToBalance } from './wallet-store';

function Balance({ accountId }: { accountId: string }) {
  const [balance, setBalance] = useState<string>();

  Tray.useFocusEffect(
    useCallback(() => {
      return subscribeToBalance(accountId, setBalance);
    }, [accountId])
  );

  return <Text>{balance ?? 'Loading balance…'}</Text>;
}
```

Render `Balance` inside a tray screen. Back starts the subscription again without resetting the screen's state. Changing `accountId` while focused cleans up the old subscription and starts the new one. Keep the callback memoized with `useCallback` to avoid restarting it on unrelated renders.

By default, focus changes with the active route, before its transition finishes. The current screen stays focused during dismissal until the sheet finishes closing; removing the provider cleans up immediately. Pass `{ afterTransition: true }` for work such as [focusing an input](#focus-an-input-after-the-transition) that should wait until navigation finishes. This hook follows the tray's stack, independently of React Navigation focus and app foreground state. For whole-tray visibility, continue using `Tray.useTrayState((state) => state.isPresented)`.

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
  tray,
  color,
}: TrayHeaderProps<Routes>) {
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
            onPress={tray.back}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color }}>Back</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close tray"
          onPress={tray.dismiss}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color }}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

<Tray.Stack
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
</Tray.Stack>;
```

The tray measures your header automatically, including changes in its height, and crossfades headers with the screen transition. This also works for shared transitions, Back, and transitions to or from a hidden header. The outgoing header keeps its state until the transition settles, then unmounts; returning mounts it again. Only the current header accepts touches and is exposed to accessibility. Your header owns its buttons and accessibility labels.

Set `handleVisible={false}` on the stack to remove the drag indicator and its spacing. You can override either setting in a screen's `options`. Dragging to dismiss, tapping the backdrop, and Android Back continue to work. Returning `null` removes only the header; combine it with `handleVisible: false` for content without either element.

## Change the appearance and motion

Configure shared styling once on `Tray.Stack`. Use `appearance="floating"` (the default) for an inset card or `appearance="sheet"` for a sheet attached to the bottom edge.

```tsx
<Tray.Stack
  backgroundColor="#23252b"
  textColor="#f4f5f7"
  animation={{ type: 'spring', stiffness: 300, damping: 30 }}
>
  <Tray.Screen name="note" component={Note} />
  <Tray.Screen name="preview" component={Preview} />
</Tray.Stack>
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

function FullScreenNote({ tray }: TrayScreenProps<Routes, 'note'>) {
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
          onPress={() => tray.push('preview', { text })}
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

Read `Tray.useKeyboard()` inside a tray screen or custom header to use the same keyboard signal that moves the tray. `progress` and `height` are Reanimated shared values; use them in worklets. `isVisible` is a React boolean for touches and accessibility:

```tsx
import { Text } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

function NoteHelp() {
  const { progress, isVisible } = Tray.useKeyboard();
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

Use `Tray.useFocusEffect` with `{ afterTransition: true }` to focus after the screen has arrived. For example, replace `Note` with this component:

```tsx
import { useCallback, useRef, useState } from 'react';
import { Button, TextInput, View } from 'react-native';

function Note({ tray }: TrayScreenProps<Routes, 'note'>) {
  const input = useRef<TextInput>(null);
  const [text, setText] = useState('');

  Tray.useFocusEffect(
    useCallback(() => {
      input.current?.focus();
    }, []),
    { afterTransition: true }
  );

  return (
    <View style={{ padding: 24 }}>
      <TextInput
        ref={input}
        accessibilityLabel="Note"
        value={text}
        onChangeText={setText}
      />
      <Button title="Preview" onPress={() => tray.push('preview', { text })} />
    </View>
  );
}
```

This waits for the native sheet to settle open and for screen navigation to finish, including shared-element handoff. It works with timing animations, springs, Reduce Motion, and Back; no duration or timer is needed. Queued navigation runs before the effect, so an intermediate screen does not steal focus. Closing or leaving the screen skips a pending callback and cleans up an already-running effect. A cancelled dismissal can run the effect again after the tray settles open.

## Anchor content during resizing

Content stays anchored to the bottom by default while the card grows or shrinks between screens. Set `anchor="top"` on the stack to keep content attached to the top instead:

```tsx
<Tray.Stack anchor="top">
  <Tray.Screen name="note" component={Note} />
  <Tray.Screen name="preview" component={Preview} />
</Tray.Stack>
```

With the default `"bottom"` anchor, both incoming and outgoing content follow the bottom edge, including on Back and shared transitions. The header stays at the top. Content keeps its natural height and scroll position; taller content is revealed as the card expands.

To override the stack for one screen, set `anchor` to `'top'` or `'bottom'` in its `Tray.Screen` options. Each screen keeps its own anchor while entering and leaving.

## Multiple trays

Call `createTray` for each flow, such as a wallet or search filters. Each provider has its own stack and hook scope. You can keep several providers in the root layout or place them around individual features.

Present one tray at a time. To open another after closing, use the first tray's `onDismiss` callback.

## Share an element between tray screens

For a flow such as choosing a recipient and reviewing a payment, an avatar can move between screens. Define a [transition recipe](./transitions.md) outside render:

```tsx
import { defineTransition } from 'react-native-screen-choreography/core';

const recipient = defineTransition({
  shared: { avatar: { kind: 'bounds', radius: [21, 36] } },
});
```

Wrap the avatar on the source screen:

```tsx
<recipient.Element
  name="avatar"
  groupId={`recipient:${person.id}`}
  style={{ width: 42, height: 42 }}
>
  <Avatar person={person} />
</recipient.Element>
```

Place its destination on the review screen, using the same name and group:

```tsx
<recipient.Element.Target
  name="avatar"
  groupId={`recipient:${route.params.person.id}`}
  style={{ width: 72, height: 72 }}
/>
```

Pass the group when pushing your declared `review` screen:

```tsx
tray.push('review', { person }, { groupId: `recipient:${person.id}` });
```

Back reverses the transition automatically. The stack's `animation` controls its timing. Keep the source element mounted and use a distinct group for each item; the destination displays the same avatar, so it doesn't need another child.

To continue to a third screen, add another matching `Element.Target` there and pass the same group to the next `tray.push`. The live content moves from its current target to the next one. For changing button labels, provide each target's label and action through `metadata` and crossfade the `collapsed` and `expanded` labels inside the single owner using `useSharedElementPresentation().presentationProgress`.

Shared elements must belong to the same tray. A ready destination can share only part of a group: matching elements move together, while unmatched content follows the screen fade. If no matching element is available, the screens use the normal crossfade. No extra choreography provider is needed.

See the [wallet tray demo](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/shared/tray/TrayDemo.tsx) for a full-screen recipient list and retained forms, or the [Gallery Plus demo](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/shared/tray/GalleryPlusTray.tsx) for a compact introduction that expands into plan selection with a shared photo composition. Both are available from the landing screen in either example app. The [API reference](../api/tray.md) covers all options.

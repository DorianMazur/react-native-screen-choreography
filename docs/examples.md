---
title: See the motion
description: Real native app recordings and runnable examples for React Navigation and Expo Router.
layout: page
sidebar: true
---

<div class="ch-examples-page">

<div class="ch-examples-heading">

<p class="ch-kicker">FROM THE EXAMPLE APPS</p>

# See the motion.

Explore the same five demos you’ll find on the app’s home screen: Gallery, Trips, Wallet, and two dynamic trays. Start with the native recordings, then run the examples to try the interactions yourself.

</div>

<DemoGallery />

<div class="ch-tray-examples">
<article>

## Wallet dynamic tray

Move from a wallet overview to a payment form, a full-screen recipient list, and a review. Go Back to keep editing the retained form; the sheet resizes with each view. Payments are simulated.

[Build a dynamic tray](./guide/dynamic-trays) · [Explore the source](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/shared/tray/TrayDemo.tsx)

</article>
<article>

## Gallery dynamic tray

Open **Explore Plus** to expand a photo composition into benefits and plan selection. Choose a plan, visit **Good to know**, and go Back to find your selection preserved. **Preview Plus** shows the selected plan without making a purchase.

[Share an element inside a tray](./guide/dynamic-trays#share-an-element-between-tray-screens) · [Explore the source](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/shared/tray/GalleryPlusTray.tsx)

</article>
</div>

<div class="ch-examples-run vp-doc">

## Make it yours

The React Navigation and Expo Router apps share demo screens, so you can compare the two integrations using the same transitions. Gallery, Trips, and Wallet combine shared elements with reveals for supporting content. The tray demos explore a local view stack, retained form state, and content-driven sheet sizing. Explore the `defineTransition` definitions to adapt the motion to your own app.

- **React Navigation:** follow the [bare example setup](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/react-navigation/README.md) to install dependencies, build, and run on iOS or Android.
- **Expo Router:** follow the [Expo example setup](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/expo-router/README.md). Use a native development build; Expo Go does not include this library’s native host.

The checked-in example environments are React Native 0.83 and Expo SDK 57. See [installation](./guide/installation) for the package’s declared peer requirements and compatibility considerations.

The homepage preview follows the current Gallery layout: a wide featured photo above smaller tiles. It is a browser illustration of the ownership model. The native recordings above demonstrate the transitions. Run either app to try them and both tray flows.

Photography comes from the existing example assets. [Sources and license](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/shared/assets/photos/README.md).

</div>
</div>

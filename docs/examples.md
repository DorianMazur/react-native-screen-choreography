---
title: See the motion
description: Real native app recordings and runnable examples for React Navigation and Expo Router.
layout: page
sidebar: false
---

<div class="ch-examples-page">

<div class="ch-examples-heading">

<p class="ch-kicker">FROM THE EXAMPLE APPS</p>

# See the motion.

Real transitions, recorded in the native examples. Watch the demos, then explore the code behind them.

</div>

<DemoGallery />

<div class="ch-examples-run vp-doc">

## Make it yours

Gallery, Wallet, and Wallet setup share their screen implementations between both example apps. They use module-scoped `defineTransition` recipes, one retained owner per shared role, and local companion reveals.

- **React Navigation:** follow the [bare example setup](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/react-navigation/README.md) to install dependencies, build, and run on iOS or Android.
- **Expo Router:** follow the [Expo example setup](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/expo-router/README.md). Use a native development build; Expo Go does not include this library’s native host.

The checked-in example environments are React Native 0.83 and Expo SDK 57. See [installation](./guide/installation) for the package’s declared peer requirements and compatibility considerations.

The homepage preview is a browser illustration of the ownership model. These recordings show the actual React Native library. Neither is a performance benchmark; see [performance measurements](./performance) for the measurement setup and its limits.

Photography comes from the existing example assets. [Sources and license](https://github.com/DorianMazur/react-native-screen-choreography/blob/main/examples/shared/assets/photos/README.md).

</div>
</div>

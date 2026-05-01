# Library Comparison Guide

This document compares `react-native-screen-choreography` with other common approaches to shared element transitions in React Native. It is written for app developers evaluating which tool fits their product requirements.

The point is not that every other library is bad. The point is that `react-native-screen-choreography` is a better fit when you need coordinated, production-oriented, multi-element transitions rather than a single isolated hero element.

## Short Version

`react-native-screen-choreography` is strongest when you need:

- multiple shared elements coordinated in one transition session
- companion motion such as backdrop dim, chart reveal, and staged content reveal
- explicit control over transition ownership above native-stack containers
- more reliable interruption handling for real navigation flows
- a modern React Native setup built around Fabric and Reanimated 4-era patterns

If you only need one simple shared element with minimal choreography, other options can still be simpler.

## Comparison Table

| Capability | react-native-screen-choreography | react-native-shared-element | Reanimated Shared Element Transitions | Plain React Navigation screen transitions |
| --- | --- | --- | --- | --- |
| Multi-element choreography | Yes, one session can coordinate many elements | Limited, mostly element-by-element | Limited, primarily pair matching | No |
| Companion motion from shared progress | Yes | No first-class API | No first-class API | No |
| Overlay ownership above native-stack containers | Yes, with a native host | Native transition view, but older integration model | Navigator-coupled implementation | No |
| Interruption handling | Explicit runtime concern | Limited | Limited / experimental | Screen-level only |
| Public API for staged reveal content | Yes | No | No | No |
| Current architecture target | Modern Fabric + Reanimated runtime | Older ecosystem assumptions | Experimental path inside Reanimated | Screen animations only |
| Best use case | Rich card-to-detail and multi-element flows | Low-level shared element primitives | Simple tag-based demos and experiments | Basic screen-to-screen motion |

## Compared With `react-native-shared-element`

### What it does well

- It established a strong primitive model for source/target element matching.
- It handles overlay-based stand-ins and element hiding at a low level.
- It exposes a powerful native transition view for direct control.

### Where `react-native-screen-choreography` is better

- It is designed around coordinated multi-element transitions, not just one element at a time.
- It exposes shared progress to companion screen motion such as backdrop dim and staged reveals.
- It is shaped around a more current React Native stack instead of older navigation and node-handle assumptions.
- It treats interruption handling, reverse flows, and screen ownership as first-class runtime problems.
- It gives app developers higher-level building blocks so they do not have to manually wire every transition primitive themselves.

### When you would still choose `react-native-shared-element`

- You want low-level control over a single transition primitive.
- You are maintaining an older codebase already built around it.
- You do not need choreography across several elements and companion animations.

## Compared With Reanimated Shared Element Transitions

### What it does well

- The tag-based API is concise.
- It fits naturally into simple demos.
- It keeps animation execution on the UI runtime.

### Where `react-native-screen-choreography` is better

- It is built for coordinated screen choreography, not only matching two views with the same tag.
- It supports richer transition composition: morphing containers, move-resize anchors, cross-faded text, backdrop motion, and staged content reveal in one runtime model.
- It gives apps explicit control over transition ownership, pending target visibility, and early settle behavior.
- It offers a clearer public API for detail-screen companion motion instead of leaving that logic in app code.
- It is easier to reason about when interruptions and reverse flows matter to the product feel.

### When you would still choose Reanimated Shared Element Transitions

- You want the smallest possible API for a simple shared-element demo.
- You do not need multi-element coordination or companion choreography.
- You are comfortable with its current experimental constraints.

## Compared With Plain React Navigation Screen Transitions

### What screen transitions do well

- They are already part of the navigation stack.
- They require very little setup.
- They are fine for screen-level presentation changes.

### Where `react-native-screen-choreography` is better

- It preserves visual continuity for specific elements instead of only animating the whole screen.
- It lets the source and target screen participate in one coordinated transition session.
- It keeps the destination hidden until the overlay is ready, which avoids some of the most obvious visual handoff failures.
- It gives you a shared progress contract for detail-screen motion rather than forcing unrelated animations to guess timing.

### When plain screen transitions are enough

- You do not need any element continuity.
- A simple push, modal, or fade transition already matches the product design.
- You want the least custom runtime behavior possible.

## Why This Library Is Stronger For Rich Product Transitions

`react-native-screen-choreography` is not trying to be the smallest API. It is trying to solve the real product case where one user action changes multiple pieces of UI at once:

- the card container changes size and shape
- the icon preserves identity
- labels and values cross-fade into a new layout
- the backdrop responds to the same session progress
- detail content reveals in a staged way
- early user interaction can settle the session cleanly

That combination is where this library is better than the alternatives above.

## Honest Tradeoffs

This library is not automatically better for every app.

- It has more setup than a plain navigator transition.
- It is currently best with `@react-navigation/native-stack` and disabled stack animation.
- It still depends on live target measurement for startup-critical elements.
- Interactive gesture progress is still a future improvement.

If your app only needs one simple shared image transition, this library may be more infrastructure than you need.

## Choose This Library If

- you want card-to-detail transitions with several coordinated elements
- you care about companion motion, not just one hero element moving
- you want reusable hooks for reveal timing and interaction settling
- you need a runtime that treats interruption handling as part of the product experience

## Choose Something Simpler If

- you only need screen-level navigation animation
- you only need one lightweight shared element in a demo or prototype
- you do not want to adopt the recommended native-stack overlay setup
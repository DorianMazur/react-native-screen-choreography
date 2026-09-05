# Known Limitations And Roadmap

This document describes the current support boundaries for the library and the work that is most likely to improve real-world app integration.

## Best-Supported Configuration

Today, the library is tuned for this setup:

- React Native >= 0.76 with the New Architecture / Fabric enabled
- React >= 18
- `@react-navigation/native-stack` (validated on 7.x)
- `react-native-screens` >= 4
- `react-native-reanimated` >= 4
- `react-native-worklets` >= 0.8
- stack `animation: 'none'` with transparent detail presentation

Other setups may work, but they are not the primary support target yet.

## Current Limitations

| Area                   | Current behavior                                                                                                                                    | Practical guidance                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime architecture   | New Architecture only                                                                                                                               | Use Fabric-enabled React Native apps for now                                                                                           |
| Navigator integration  | Best with React Navigation native-stack or Expo Router's native `Stack`, with stack animation disabled                                             | Keep the navigator from competing with the overlay; Expo Router requires a development build                                           |
| Gesture progress       | `useInteractiveTransition` lets a custom gesture drive backward progress, but native-stack's built-in swipe progress is not connected automatically | Use the controlled hook for custom gestures; treat the built-in swipe as a time-driven back trigger                                    |
| Startup latency        | First-open forward transitions depend on live target measurement; repeated opens validate cached target metrics with one batched read               | Prefer stable structural target elements and avoid unnecessary target churn                                                            |
| Renderer fidelity      | Custom renderers receive frozen React content, style, and metrics; arbitrary native view pixels are not captured                                    | Build normal transitions from React-renderable state; use `SharedElement.Live` only when one stateful native subtree must be preserved |
| Live payload lifecycle | Teleported content remains owned by the screen containing `SharedElement.Live`                                                                      | Keep the owner route mounted until the payload has returned; use one owner and one `LiveTarget` per active identity                    |
| Rapid interruptions    | Fast push-pop-push handling is improved but still a hardening area                                                                                  | Keep regression coverage around rapid interruption paths                                                                               |
| Virtualized lists      | Off-screen source rows cannot be measured                                                                                                           | Start transitions from mounted, visible source elements                                                                                |
| Accessibility and RTL  | Broader validation is still needed                                                                                                                  | Test large text, RTL, and accessibility flows in app-specific layouts                                                                  |

## Recommended Workarounds Today

- Disable native-stack screen animation and let the overlay own the transition.
- Keep the target screen transparent until the choreography session has taken over.
- Use `useLatchedReveal()` for staged detail content so it stays visible after the session settles.
- Use `settleTransition()` when scroll or gesture interaction should immediately settle the active session.
- Use `ready={false}` or `useChoreographyBlocker()` when async destination work must finish before measurement.
- Use velocity-aware `settle()` when releasing a custom back gesture.
- Prefer structural elements such as the card container and icon as the startup-critical shared elements.

## Roadmap Priorities

### Highest leverage

1. Connect `useInteractiveTransition` to native-stack gesture progress when a stable public event is available.
2. Add built-in gesture-handler recipes around velocity-aware `settle()`.
3. Publish renderer recipes for surfaces, moving content, clipping, and crossfades without making them automatic defaults.
4. Harden live teleport ownership under rapid interruption and nested navigator flows.

### Medium-term

5. Intentionally support more navigator configurations.
6. Add end-to-end regression coverage for interruption-heavy flows.
7. Improve debug tooling so session ownership and visibility state are easier to inspect from the device.

### Longer-term

8. Add more complete example choreographies for common product patterns without prescribing one renderer per element type.

## What The Library Already Does Well

1. Coordinating multiple shared elements inside one transition session.
2. Driving companion motion such as backdrop dim, chart reveal, and staged content from one progress value.
3. Separating registry / coordinator behavior from visual rendering.
4. Keeping the public API flexible while solving overlay ownership natively.
5. Providing a usable example app that exercises forward, reverse, and interruption paths.

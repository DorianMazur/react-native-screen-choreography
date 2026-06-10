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

| Area | Current behavior | Practical guidance |
| --- | --- | --- |
| Runtime architecture | New Architecture only | Use Fabric-enabled React Native apps for now |
| Navigator integration | Best with native-stack and disabled stack animation | Keep the navigator from competing with the overlay |
| Gesture progress | Any back navigation (header back, hardware back, programmatic `goBack`, swipe-back) plays the reverse animation, but progress is time-driven — the user's finger does not yet drive `progress.value` | Treat swipe-back as a back-navigation trigger; the overlay still owns the visual transition. Finger-tracked progress is on the roadmap |
| Startup latency | First-open forward transitions depend on live target measurement; repeated opens validate cached target metrics with one batched read | Prefer stable structural target elements and avoid unnecessary target churn |
| Stand-in fidelity | Overlay stand-ins are React-rendered by default; `snapshotMode="bitmap"` captures a native bitmap per element for renderers that want pixel-faithful motion | Use `snapshotMode="bitmap"` for complex content (images mid-load, gradients, platform widgets) and render `source.bitmap` / `target.bitmap` in the transition renderer |
| Rapid interruptions | Fast push-pop-push handling is improved but still a hardening area | Keep regression coverage around rapid interruption paths |
| Virtualized lists | Off-screen source rows cannot be measured | Start transitions from mounted, visible source elements |
| Accessibility and RTL | Broader validation is still needed | Test large text, RTL, and accessibility flows in app-specific layouts |

## Recommended Workarounds Today

- Disable native-stack screen animation and let the overlay own the transition.
- Keep the target screen transparent until the choreography session has taken over.
- Use `useLatchedReveal()` for staged detail content so it stays visible after the session settles.
- Use `settleTransition()` when scroll or gesture interaction should immediately settle the active session.
- Prefer structural elements such as the card container and icon as the startup-critical shared elements.


## Roadmap Priorities

### Highest leverage

1. Build on the opt-in bitmap snapshot path (`snapshotMode="bitmap"`, TurboModule `ScreenChoreographySnapshot`) with automatic crossfade-to-live handoff at settle and a ready-made bitmap stand-in primitive.
2. Wire reverse progress to the user's finger via native-stack gesture progress / RNScreens v2 `goBackGesture` events, so swipe-back becomes interactive instead of just a trigger for a time-driven reverse.
3. Promote registry collisions from dev warnings to a compound `(id, screenId)` primary key so cross-screen `groupId` conflicts cannot misroute a transition.
4. Add an ergonomic helper API (`createChoreography`, `morphSurface`, `move`, `crossfade`, `fadeIn`, `fadeOut`, `stagger`, `<Choreography.Group>`) on top of the current primitives.

### Medium-term

5. Intentionally support more navigator configurations.
6. Add end-to-end regression coverage for interruption-heavy flows.
7. Improve debug tooling so session ownership and visibility state are easier to inspect from the device.

### Longer-term

8. Add higher-level presets for common patterns such as card-to-detail and gallery transitions.

## What The Library Already Does Well

1. Coordinating multiple shared elements inside one transition session.
2. Driving companion motion such as backdrop dim, chart reveal, and staged content from one progress value.
3. Separating registry / coordinator behavior from visual rendering.
4. Keeping the public API flexible while solving overlay ownership natively.
5. Providing a usable example app that exercises forward, reverse, and interruption paths.

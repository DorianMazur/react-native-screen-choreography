# Known Limitations And Roadmap

This document describes the current support boundaries for the library and the work that is most likely to improve real-world app integration.

## Best-Supported Configuration

Today, the library is tuned for this setup:

- `@react-navigation/native-stack`
- `animation: 'none'`
- transparent detail presentation
- New Architecture / Fabric enabled

Other setups may work, but they are not the primary support target yet.

## Current Limitations

| Area | Current behavior | Practical guidance |
| --- | --- | --- |
| Runtime architecture | New Architecture only | Use Fabric-enabled React Native apps for now |
| Navigator integration | Best with native-stack and disabled stack animation | Keep the navigator from competing with the overlay |
| Gesture progress | Reverse transitions are time-driven, not gesture-driven | Treat swipe-back as a normal navigation event, not a shared progress source |
| Startup latency | Forward transitions still depend on live target measurement | Prefer stable structural target elements and avoid unnecessary target churn |
| Stand-in fidelity | Overlay stand-ins are React-rendered, not native snapshots | Keep shared content deterministic and avoid unstable ambient state |
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

1. Add a snapshot or replica path for startup-critical elements such as the card container and icon (the in-tree `getSnapshot` freezes the React layer; native bitmap fidelity is still future work).
2. Wire reverse progress to native-stack gesture progress.
3. Promote registry collisions from dev warnings to a compound `(id, screenId)` primary key so cross-screen `groupId` conflicts cannot misroute a transition.
4. Add an ergonomic helper API (`createChoreography`, `morphSurface`, `move`, `crossfade`, `fadeIn`, `fadeOut`, `stagger`, `<Choreography.Group>`) on top of the current primitives.

### Medium-term

5. Reuse target metrics more aggressively for repeated routes.
6. Intentionally support more navigator configurations.
7. Add end-to-end regression coverage for interruption-heavy flows.
8. Improve debug tooling so session ownership and visibility state are easier to inspect from the device.

### Longer-term

9. Offer a higher-fidelity opt-in mode for startup-critical elements.
10. Add higher-level presets for common patterns such as card-to-detail and gallery transitions.
11. Expand the docs with a dedicated troubleshooting guide.

## What The Library Already Does Well

1. Coordinating multiple shared elements inside one transition session.
2. Driving companion motion such as backdrop dim, chart reveal, and staged content from one progress value.
3. Separating registry / coordinator behavior from visual rendering.
4. Keeping the public API flexible while solving overlay ownership natively.
5. Providing a usable example app that exercises forward, reverse, and interruption paths.

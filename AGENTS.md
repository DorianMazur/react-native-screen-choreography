# AGENTS.md

This file describes the current repository expectations for coding agents working on `react-native-screen-choreography`.

## Project Purpose

`react-native-screen-choreography` is a React Native library for multi-element shared transitions with a hybrid runtime:

- JavaScript / TypeScript for registration, pairing, screen readiness, and navigation orchestration
- Reanimated for shared progress and visual interpolation on the UI thread
- a native overlay host for reliable presentation above native-stack containers

## Canonical Documentation

Use these files as the source of truth:

- `README.md`: public package documentation and integration steps
- `docs/architecture-plan.md`: runtime architecture and contributor-level internals
- `docs/limitations-and-next-steps.md`: support boundaries, workarounds, and roadmap priorities
- `example/README.md`: example app setup and manual exploration guide

## Repository Layout

- `src/`: public API, provider, coordinator, hooks, overlay, and animation helpers
- `example/`: React Native example app showing the reference list-to-detail flow
- `docs/`: developer-facing technical and integration documentation
- `__tests__/`: Jest coverage for core utilities and infrastructure
- `android/` and `ios/`: native transition host implementation

## Public API Surface

Check `src/index.tsx` before documenting or changing exports.

Current important exports include:

- `ChoreographyProvider`
- `ChoreographyScreen`
- `SharedElement`
- `useChoreographyNavigation`
- `useChoreographyProgress`
- `useLatchedReveal`
- `useStaggeredReveal`
- stand-in primitives: `StandInContainer`, `StandInElement`, `StandInCrossfade`, `resolveSurfaceStyle`
- debug helpers: `setDebugEnabled`, `setDebugLevel`, `setDebugCoalesce`, `isDebugEnabled`, `isTraceEnabled`, `getDebugLogs`, `clearDebugLogs`
- types: `ElementSnapshot`, `ChoreographyDebugConfig`, `ChoreographyDebugLevel`, `ChoreographyDebugCategory`

## Runtime Assumptions

- New Architecture / Fabric only
- best supported with `@react-navigation/native-stack`
- recommended stack configuration is `animation: 'none'` with transparent detail presentation
- the overlay should own the visible transition instead of competing with navigator animation
- progress-driven companion motion is part of the intended public API
- `SharedElement` registration is **stable** per `(id, groupId, screenId)` — do not introduce changes that cause unregister/re-register on prop or render changes
- the coordinator captures a frozen `ElementSnapshot` per pair at session start; the overlay must read those snapshots, never live `SharedElement` props
- real elements are hidden in the same frame the overlay first paints (driven by `handleOverlayReady` / `handleHostPresentationReady`), not when the session activates
- the provider exposes two contexts: stable `ChoreographyActionsContext` for lifecycle callbacks and volatile `ChoreographyContext` for active-session state — keep registration effects depending on the actions context only
- screen-level visibility lives in `src/screenVisibility.ts` and must stay direction-agnostic: derive `(role, phase)` from the session, then compute opacity and pointer-events from `(direction, role, phase, progress)`. Do not add forward-only special cases back to `ChoreographyScreen`.

## Current Feature Boundaries

- interactive gesture progress is not wired yet
- startup still depends on live target measurement for structural elements
- the runtime does not yet use native snapshots or replicas for shared content (the in-tree `ElementSnapshot` freezes the React layer only)
- the registry is keyed by `id`; cross-screen `groupId` conflicts only emit dev warnings
- rapid interruption paths are actively hardened and should be regression-tested after changes

## Working Conventions

- keep docs aligned with the actual exported API in `src/index.tsx`
- prefer library-level abstractions for transition lifecycle behavior instead of example-only screen code
- when moving behavior out of the example app, expose a focused reusable API rather than copying helper logic into another file
- document current behavior, not abandoned plans or speculative architecture
- use `boxShadow` (RN 0.76+) instead of legacy `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`/`elevation` for shadows
- never animate `boxShadow` params per-frame on Android — it re-creates drawables every call; animate `opacity` on a view with a static `boxShadow` instead
- the `debug` prop on `ChoreographyProvider` is `boolean | { level, categories?, logEveryFrame? }` with levels `'error' | 'warn' | 'info' | 'trace'`; apply it inside a `useEffect` so toggling never re-creates the registry or coordinator
- never call `syncHiddenElements()` eagerly when a session activates — hiding must remain driven by the overlay's `useLayoutEffect` and the native host's presentation ack, with the 150ms `waitForOverlayReady` timeout as the only safety net
- `ChoreographyScreen` visibility must gate on BOTH `pendingTargetScreenId === screenId` and `(role === 'target' && phase === 'preparing')` — the new screen mounts ~150ms before the session activates, so role-only gating leaves a visible window
- the static visibility gate must live on a plain outer `View` with inline `opacity`, not merged into an `Animated.View` style array; on Android Fabric, Reanimated's first style commit can lag one frame and a single `Animated.View` flashes

## Commands

Run these from the repository root unless noted otherwise:

- `yarn typecheck`
- `yarn test --runInBand`
- `yarn lint`
- `cd example && yarn ios`
- `cd example && yarn android`

## Areas To Inspect First

When debugging or extending behavior, start here:

- `src/ChoreographyProvider.tsx`
- `src/TransitionCoordinator.ts`
- `src/TransitionOverlay.tsx`
- `src/standin/StandInContainer.tsx`
- `src/hooks/useChoreographyNavigation.ts`
- `src/hooks/useChoreographyProgress.ts`

## Documentation Expectations

- public docs should explain how to integrate and use the library from an application developer perspective
- contributor docs should explain current runtime behavior and extension points
- avoid stale references to missing files or removed APIs
- keep examples realistic and aligned with the example app in this repository
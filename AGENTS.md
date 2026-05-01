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

## Runtime Assumptions

- New Architecture / Fabric only
- best supported with `@react-navigation/native-stack`
- recommended stack configuration is `animation: 'none'` with transparent detail presentation
- the overlay should own the visible transition instead of competing with navigator animation
- progress-driven companion motion is part of the intended public API

## Current Feature Boundaries

- interactive gesture progress is not wired yet
- startup still depends on live target measurement for structural elements
- the runtime does not yet use native snapshots or replicas for shared content
- rapid interruption paths are actively hardened and should be regression-tested after changes

## Working Conventions

- keep docs aligned with the actual exported API in `src/index.tsx`
- prefer library-level abstractions for transition lifecycle behavior instead of example-only screen code
- when moving behavior out of the example app, expose a focused reusable API rather than copying helper logic into another file
- document current behavior, not abandoned plans or speculative architecture
- use `boxShadow` (RN 0.76+) instead of legacy `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius`/`elevation` for shadows
- never animate `boxShadow` params per-frame on Android — it re-creates drawables every call; animate `opacity` on a view with a static `boxShadow` instead

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
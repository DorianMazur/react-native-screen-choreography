# Tray navigator development

The package provides nested multi-step trays for React Navigation and Expo Router. Edit shared presentation in `src/tray` and keep router-specific navigation types and contexts in their respective adapters. The package ships TypeScript and JavaScript. Reanimated, Software Mansion’s bottom sheet and Keyboard Controller supply the native integrations.

- Keep public entries export-only. Match every runtime entry with a packaged Jest mock and its types. Keep navigation dependencies out of the other adapter.
- Use the router’s route keys. Retain outgoing descriptors and local page state until visual settlement. Reject stale session and transition acknowledgements. Native sheet settlement releases closing sheets. A cancelled drag must cancel pending removal.
- Reduce Motion, keyboard frames, accessibility focus, Back, rapid reopen, and touch handoff after dismissal are part of the tray contract.
- The active page controls its Reanimated shared transition boundary. Screen endpoints are owned independently. Persistent content headers live inside the native sheet, outside page fades, and follow the same timeline as the tray.
- Keep both example apps on the shared Wallet and Gallery Plus screens. Expo layouts must declare file routes for their screen state. Bare and Expo navigation contexts must each come from their host.
- Use `docs/guide` and `docs/api` as canonical public references. Keep the README concise. Update the public mock, docs and consumer tests with a changed public contract.
- Use a dedicated worktree, short purpose-named branches, and Conventional Commits. Add focused tests for observable regressions. Run `yarn typecheck`, `yarn test --runInBand`, `yarn lint`, `yarn prepare`, and `yarn docs:build`.
- For visual changes, exercise forward and Back on iOS and Android. An accessibility check establishes navigation. Inspect recorded frames to verify moving content, especially in a resizing native sheet.

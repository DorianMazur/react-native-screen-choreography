# React Native Screen Choreography

Multi-step tray navigation for React Navigation and Expo Router. Push and pop routes inside a native bottom sheet, resize it to each page, preserve drafts on Back, and keep persistent artwork attached to the sheet.

- [Installation](docs/guide/installation.md)
- [Build a tray](docs/guide/dynamic-trays.md)
- [API reference](docs/api/tray.md)
- [Wallet and Gallery Plus examples](docs/examples.md)

## Migrating from 0.x

The 1.0 API focuses on trays. Import `createTrayNavigator` and `trayStackLayout` from the package root or its `/expo-router` entry. Replace screen-level Choreography providers, targets, and transition recipes with Reanimated 4.8 shared elements. Reanimated endpoints mount separately. Lift state that needs to survive a change of screen.

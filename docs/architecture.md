# Tray navigation

The parent navigator uses `trayStackLayout` to keep the app visible beneath the sheet. A tray uses its host router’s stack, descriptors and route keys. Its presentation state tracks the outgoing page until the animation completes and retains the closing sheet until native settlement. Session and transition IDs guard callbacks that arrive after another navigation.

The native bottom sheet provides dragging, snapping and settlement. Reanimated drives card size, keyboard offsets, page and header motion. Each page has a shared transition boundary that is active while it is the destination. Persistent content headers live inside the sheet, outside the page boundaries, and receive the page progress directly.

Use the root entry for React Navigation and the Expo Router entry for Expo’s navigation context.

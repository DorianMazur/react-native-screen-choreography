# Shared example package

`@screen-choreography/example-shared` is a private Yarn workspace used by the
React Navigation and Expo Router apps. It contains their demo screens, transition
recipes, assets, theme, and navigator-independent bindings.

Run `yarn install` at the repository root to link the package. Both apps declare
it as a `workspace:*` dependency and import its entry points:

```tsx
import { ExampleBindings, theme } from '@screen-choreography/example-shared';
import { GalleryListScreen } from '@screen-choreography/example-shared/gallery';
```

| Entry point                                       | Exports                                                       |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `@screen-choreography/example-shared`             | Navigation bindings and types, observation type, theme        |
| `@screen-choreography/example-shared/landing`     | Landing screen                                                |
| `@screen-choreography/example-shared/gallery`     | Gallery list and detail screens                               |
| `@screen-choreography/example-shared/trips`       | Trips list and detail screens                                 |
| `@screen-choreography/example-shared/wallet`      | Token list and detail screens, token data and logo URI helper |
| `@screen-choreography/example-shared/tray`        | Demo tray providers                                           |
| `@screen-choreography/example-shared/performance` | JavaScript stress menu                                        |

Each app's `ExampleScreen` adapter supplies navigation and interactive transition
bindings through `ExampleBindings`. Keep navigator-specific imports and route
mapping in those adapters.

The package exports TypeScript source directly, so Metro compiles it with the
consuming app's Babel and worklets configuration. No separate package build is
needed. React, React Native, Reanimated, Worklets, safe-area context, and the
choreography library are peer dependencies supplied by each app. The existing
Metro monorepo configuration resolves these peers to the consuming app, including
when the two apps use different runtime versions.

The apps' TypeScript checks follow the package imports and check the shared source.
Keep assets beside their source files so Metro can bundle their static `require`
paths for development and offline builds.

To regenerate the shared icons from the repository root:

```bash
yarn workspace @screen-choreography/example-shared generate:icons
```

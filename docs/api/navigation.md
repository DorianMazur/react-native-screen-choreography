---
title: Navigation
description: React Navigation, Expo Router, and interactive back hook signatures and options.
---

# Navigation

Use the adapter for your router. Navigation hooks require a mounted provider and the corresponding route context.

## `useChoreographyNavigation`

Available from `react-native-screen-choreography`.

```ts
const { navigate, goBack } = useChoreographyNavigation(navigation);

navigate(
  screenName: string,
  params?: any,
  options?: ChoreographyNavigationOptions,
): Promise<void>;

goBack(options?: ChoreographyNavigationOptions): Promise<void>;
```

Pass the current screen's React Navigation `navigation` object. `navigate` dispatches `navigation.navigate` and resolves the actual destination route instance for pairing.

```tsx
void navigate(
  'Detail',
  { artworkId: '42' },
  {
    transitionConfig: { group: 'artwork.42' },
    spring: Springs.default,
  }
);
```

Without `transitionConfig.group`, navigation is ordinary navigation. For compatibility, the root adapter also reads `params.transitionGroup` when explicit `transitionConfig` is absent. Prefer the explicit option so route data and motion stay separate.

The returned promise is **not an animation-completion signal**. Navigation preparation is asynchronous and the animation runs independently. Use provider lifecycle callbacks for session events.

### Navigation options

```ts
interface ChoreographyNavigationOptions {
  transitionConfig?: { group: string };
  spring?: SpringConfig;
  duration?: number;
}
```

Forward navigation defaults to `Springs.default`. A positive `duration` selects a timing animation in milliseconds with cubic ease-out. Keep timing values finite and positive.

Reverse behavior uses stored navigation lineage and the screen removal adapter. The forward spring is remembered; forward `duration` is not. In 0.5.0, `goBack` options are applied on active-session paths, and ordinary idle route removal uses the stored spring. Do not assume a `goBack({ duration })` override controls every return path.

See [quick start](../guide/quick-start.md) for the required stack setup.

## `useChoreographyRouter`

Available from `react-native-screen-choreography/expo-router`.

```ts
const { push, navigate, back } = useChoreographyRouter(router, currentScreenId);

push(request: ChoreographyRouterRequest<Href>): Promise<void>;
navigate(request: ChoreographyRouterRequest<Href>): Promise<void>;
back(options?: ChoreographyNavigationOptions): Promise<void>;

type ChoreographyRouterRequest<Href> = ChoreographyNavigationOptions & {
  href: Href;
  targetScreenId: string;
};
```

`router` must provide `push`, `navigate`, and `back`. `ExpoRouterLike<Href>` and `ChoreographyRouterRequest<Href>` are exported from the Expo entry.

```tsx
const { push } = useChoreographyRouter(useRouter(), 'Collection');

void push({
  href: { pathname: '/artwork/[id]', params: { id: '42' } },
  targetScreenId: 'ArtworkDetail',
  transitionConfig: { group: 'artwork.42' },
});
```

Match `currentScreenId` to the current wrapper and `targetScreenId` to the destination wrapper. Push and navigate preserve their corresponding router operation. The adapter keeps transition lineage in the provider, without adding private metadata to the URL.

The same timing and promise caveats as the React Navigation adapter apply. See [Expo Router](../guide/expo-router.md).

## `useInteractiveTransition`

Available from both integration entries. Uses the current route and provider to prepare and control a custom reverse transition.

```ts
const {
  beginBack, setProgress, finish, cancel, settle, progress, isActive,
} = useInteractiveTransition();

beginBack(options?: InteractiveBackOptions):
  Promise<InteractiveTransitionSession | null>;
setProgress(value: number): void; // Worklet; clamped to [0, 1].
finish(options?: InteractiveTransitionSettleOptions): void;
cancel(options?: InteractiveTransitionSettleOptions): void;
settle(options?: InteractiveTransitionDecisionOptions): void;
```

| Return value  | Meaning                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `progress`    | `SharedValue<number>` of gesture progress: `0` is untouched detail; `1` is completed back                                    |
| `isActive`    | React boolean; true after preparation, false when a reverse commit begins, cancellation completes, or the session is removed |
| `beginBack`   | Prepares the overlay; returns `{ id, progress }`, or `null` if no session was acquired                                       |
| `setProgress` | Updates a currently owned interactive session; stale or inactive calls are ignored                                           |
| `finish`      | Settles toward completing the back navigation                                                                                |
| `cancel`      | Settles back to the expanded detail                                                                                          |
| `settle`      | Chooses finish or cancel from projected progress                                                                             |

```ts
interface InteractiveBackOptions {
  group?: string; // Defaults to recorded forward lineage.
  targetScreenId?: string; // Defaults to the recorded source screen.
}

interface InteractiveTransitionSettleOptions {
  spring?: SpringConfig;
  duration?: number;
  velocity?: number; // Normalized progress units per second.
}

interface InteractiveTransitionDecisionOptions extends InteractiveTransitionSettleOptions {
  threshold?: number; // 0.5
  velocityImpact?: number; // 0.2 seconds
}
```

Settlement defaults to a fast spring. `settle` finishes when clamped `progress + velocity × velocityImpact` reaches `threshold`; velocity defaults to zero. Explicit `duration` chooses timing instead of a spring.

::: warning Lifecycle methods run on JavaScript
Only `setProgress` is a worklet. Call `beginBack`, `finish`, `cancel`, and `settle` on JavaScript, or use `scheduleOnRN` from a worklet. Use fresh callbacks from the render where `isActive` is true. See the [interactive back guide](../guide/interactive-back.md) before binding a gesture.
:::

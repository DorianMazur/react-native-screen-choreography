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

Pass the current screen's React Navigation `navigation` object. `navigate` uses `navigation.navigate` to open the destination and coordinates the shared transition.

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

Back returns shared content to the screen it came from and reuses the forward spring. A forward timing `duration` is not reused on return.

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

Match `currentScreenId` to the current wrapper and `targetScreenId` to the destination wrapper. `push` adds a route and `navigate` uses the router's navigation behavior; both coordinate shared motion. URLs only need your application's route parameters.

The same timing and promise caveats as the React Navigation adapter apply. See [Expo Router](../guide/expo-router.md).

## `useInteractiveGestureLifecycle`

Available from `/core` and both integration entries. Connects a custom UI-thread gesture to asynchronous interactive back preparation. Pass a controller from `useInteractiveTransition()` in the route that should be dismissed; a child can receive that controller through props to preserve the parent navigator binding.

```ts
const { begin, update, release } = useInteractiveGestureLifecycle(
  controller,
  options
);

begin(): number;
update(ticket: number, progress: number): void;
release(ticket: number, result?: InteractiveGestureRelease): void;

interface InteractiveGestureController {
  beginBack(options?: InteractiveBackOptions):
    Promise<InteractiveTransitionHandle | null>;
}

interface InteractiveGestureOptions {
  group?: string;
  targetScreenId?: string;
  scopeKey?: unknown;
  enabled?: boolean; // true
  animate?: boolean; // true
  spring?: SpringConfig;
  duration?: number;
  threshold?: number; // 0.5
  velocityImpact?: number; // 0.2 seconds
  onFallbackFinish?: () => void;
}

interface InteractiveGestureRelease {
  progress?: number; // Defaults to the last update.
  velocity?: number; // Normalized progress units per second; defaults to 0.
  cancelled?: boolean; // false
}
```

All three callbacks are worklets, so you can call them directly from gesture handlers. `begin()` returns an attempt ticket, or `0` when disabled or busy. Pass that ticket to every update and release to keep them tied to the same gesture. Updates are clamped to `[0, 1]`. Movement and release are buffered while the transition prepares, so a quick drag still works before the overlay is ready. Obsolete tickets and duplicate releases are ignored.

Release uses the same projected-progress decision as `settle` below. `cancelled: true` always cancels. If no session is available, `onFallbackFinish` runs on JavaScript only when the release qualifies to finish. `animate: false` skips preparation and uses that fallback path, so applications can respect reduced motion without disabling dismissal.

Changing `group`, `targetScreenId`, `scopeKey`, `enabled`, or `animate`, or unmounting, abandons the current attempt. Set `scopeKey` when the application's interaction identity changes, such as the selected gallery item. Gesture Handler remains an optional application dependency. See the [complete pan example](../guide/interactive-back.md).

## `useInteractiveTransition`

Available from both integration entries. Uses the current route and provider to prepare and control a custom reverse transition.

```ts
const {
  beginBack, setProgress, finish, cancel, settle, progress, isActive,
} = useInteractiveTransition();

beginBack(options?: InteractiveBackOptions):
  Promise<InteractiveTransitionHandle | null>;
setProgress(value: number): void; // Worklet; clamped to [0, 1].
finish(options?: InteractiveTransitionSettleOptions): void;
cancel(options?: InteractiveTransitionSettleOptions): void;
settle(options?: InteractiveTransitionDecisionOptions): void;
```

| Return value  | Meaning                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `progress`    | `SharedValue<number>` of gesture progress: `0` is untouched detail; `1` is completed back                                    |
| `isActive`    | React boolean; true after preparation, false when a reverse commit begins, cancellation completes, or the session is removed |
| `beginBack`   | Prepares the overlay; returns a session-bound handle, or `null` if no session was acquired                                   |
| `setProgress` | Updates a currently owned interactive session; stale or inactive calls are ignored                                           |
| `finish`      | Settles toward completing the back navigation                                                                                |
| `cancel`      | Settles back to the expanded detail                                                                                          |
| `settle`      | Chooses finish or cancel from projected progress                                                                             |

```ts
interface InteractiveBackOptions {
  group?: string; // Defaults to recorded forward lineage.
  targetScreenId?: string; // Defaults to the recorded source screen.
  signal?: AbortSignal; // Cancels pending preparation only.
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

### `InteractiveTransitionHandle`

`beginBack()` returns an `InteractiveTransitionHandle` with the session's `id` and `progress`, plus callbacks bound to that transition:

```ts
interface InteractiveTransitionHandle extends InteractiveTransitionSession {
  // Inherited: id: string; progress: SharedValue<number>.
  setProgress(value: number): void; // Worklet.
  finish(options?: InteractiveTransitionSettleOptions): void; // JavaScript.
  cancel(options?: InteractiveTransitionSettleOptions): void; // JavaScript.
}
```

When the destination is still opening, `beginBack()` takes ownership of that session and preserves its current progress and overlay. Initialize any separate animation driver from `handle.progress.value`; an interrupted opening can return a value above `0`. Cancelling restores the destination, while finishing returns to the original source.

The handle can be used immediately after `await beginBack()` without waiting for a React render. Its callbacks ignore stale ownership and cannot control a later session. Aborting `signal` cancels preparation before a handle is returned; after readiness, use `handle.cancel()`.

::: warning Lifecycle methods run on JavaScript
Only `setProgress` is a worklet on this lower-level API. Call `beginBack`, `finish`, `cancel`, and `settle` on JavaScript, or use `scheduleOnRN` from a worklet. Use the returned handle for session-bound callbacks, or fresh hook callbacks from the render where `isActive` is true. Prefer `useInteractiveGestureLifecycle` for custom gesture bindings.
:::

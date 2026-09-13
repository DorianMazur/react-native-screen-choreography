---
title: Readiness and companion content
description: Give shared targets stable geometry before animation and reveal supporting content at the right moment.
---

# Give the destination a moment.

A transition needs mounted, measurable endpoints. `ChoreographyScreen` waits for its layout before declaring readiness. Use an application gate when the destination's important geometry still depends on data, images, or fonts.

## Prefer a screen-level gate

```tsx
function DetailScreen() {
  const { data, isLoading } = useArtwork(); // Your application data hook.

  return (
    <ChoreographyScreen screenId="Detail" ready={!isLoading && !!data}>
      {data ? <DetailContent artwork={data} /> : <LoadingState />}
    </ChoreographyScreen>
  );
}
```

`ready` defaults to `true`. Setting it to `true` does not skip layout checks; it opens an additional gate. Keep the wrapper mounted while readiness changes.

Give empty targets explicit dimensions or a layout that resolves to nonzero bounds. An empty `SharedElement.Target` has no intrinsic content size before the owner arrives.

::: tip Preload the expensive work
Readiness is a short preparation gate, not an unlimited wait for network requests. In 0.5.0, the screen-readiness wait is bounded to 700 ms. Prefetch data and reserve geometry before navigation when possible; prepare a usable loading or error state when it is not.
:::

## Let a child hold readiness

`useChoreographyBlocker()` gives a child component an `acquire()` function. Each call returns an idempotent release function. All acquired blockers must release before the screen can become ready.

```tsx
import { useLayoutEffect, type ReactNode } from 'react';
import { useChoreographyBlocker } from 'react-native-screen-choreography';

function LayoutGate({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  const { acquire } = useChoreographyBlocker();

  useLayoutEffect(() => {
    if (ready) return;
    const release = acquire();
    return release; // Releases when ready changes or the child unmounts.
  }, [acquire, ready]);

  return children;
}
```

Render this beneath `ChoreographyScreen` so it blocks the correct screen. Use a stable `ready` value that becomes true for both success and a usable failure state. A blocker is independent of the screen's `ready` prop: both gates must open.

## Keep supporting content out of the critical path

The shared target geometry needs to be ready. A long description or expensive secondary section often does not. Use a declarative `Enter` role to animate it, or `useLatchedReveal` to delay mounting it until progress reaches a threshold.

```tsx
import { useLatchedReveal } from 'react-native-screen-choreography';

function SupportingContent({ artworkId }: { artworkId: string }) {
  const visible = useLatchedReveal({
    startProgress: 0.7,
    resetKey: artworkId,
  });

  return visible ? <ArtworkDetails id={artworkId} /> : null;
}
```

`useLatchedReveal` returns a boolean; it does not animate opacity. Its default `visibleWhenInactive: true` keeps standalone screens readable when there is no active session. Use it for companion content, never to conditionally mount a target the transition needs to measure.

## Yield to a user's interaction

Use `settleTransition` when ordinary screen interaction should finish the current motion in favor of that screen:

```tsx
const { settleTransition } = useChoreographyControls();

<ScrollView onScrollBeginDrag={settleTransition}>
  <DetailSections />
</ScrollView>;
```

Import `useChoreographyControls` from your integration entry and call it in a component beneath `ChoreographyScreen`. Use `useChoreographyProgress` instead when you also need the animation clock or backdrop style.

See the [hook reference](../api/hooks.md) for reveal defaults and [troubleshooting](./troubleshooting.md) for measurement failures.

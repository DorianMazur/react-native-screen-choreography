import React, { useCallback, useEffect, useRef } from 'react';
import { useIsFocused, useNavigation, useRoute } from 'expo-router';
import {
  ChoreographyScreenBase,
  type ChoreographyScreenProps,
} from './components/ChoreographyScreenBase';
import { useChoreographyNavigator } from './hooks/useChoreographyNavigation';
import { useChoreographyScreenRemoval } from './hooks/useChoreographyScreenRemoval';
import { useInteractiveTransitionNavigator } from './hooks/useInteractiveTransition';
import type { ChoreographyNavigationOptions } from './types';

export { ChoreographyProvider } from './components/ChoreographyProvider';
export {
  SharedElement,
  type LiveSharedElementProps,
  type LiveSharedElementTargetProps,
  type SharedElementProps,
  type SharedElementTargetProps,
} from './components/SharedElement';
export {
  createSharedElementComponent,
  type SharedElementComponentProps,
} from './components/createSharedElementComponent';
export { useChoreographyBlocker } from './hooks/useChoreographyBlocker';
export {
  useChoreographyProgress,
  useLatchedReveal,
  useStaggeredReveal,
} from './hooks/useChoreographyProgress';
export { Springs, Easings } from './core/constants';
export { StandInContainer } from './standin/StandInContainer';
export { StandInCrossfade } from './standin/StandInCrossfade';
export { StandInElement } from './standin/StandInElement';
export { resolveSurfaceStyle } from './standin/resolveSurfaceStyle';
export type {
  ChoreographyNavigationOptions,
  SharedElementTransition,
  SharedElementTransitionRendererProps,
  SpringConfig,
} from './types';

export interface ExpoRouterLike<Href> {
  push: (href: Href) => unknown;
  navigate: (href: Href) => unknown;
  back: () => unknown;
}

export type ChoreographyRouterRequest<Href> = ChoreographyNavigationOptions & {
  href: Href;
  /** Must match the destination ChoreographyScreen's screenId. */
  targetScreenId: string;
};

/**
 * Adapts Expo Router's imperative router to choreography sessions without
 * placing transition metadata in the destination URL.
 */
export function useChoreographyRouter<Href>(
  router: ExpoRouterLike<Href>,
  currentScreenId: string
) {
  const isFocused = useIsFocused();
  const choreography = useChoreographyNavigator({
    currentScreenId,
    isFocused,
    goBack: () => router.back(),
  });

  const push = useCallback(
    (request: ChoreographyRouterRequest<Href>) => {
      const { href, targetScreenId, ...options } = request;
      return choreography.navigate({
        targetScreenId,
        options,
        dispatchNavigation: () => router.push(href),
      });
    },
    [choreography, router]
  );

  const navigate = useCallback(
    (request: ChoreographyRouterRequest<Href>) => {
      const { href, targetScreenId, ...options } = request;
      return choreography.navigate({
        targetScreenId,
        options,
        dispatchNavigation: () => router.navigate(href),
      });
    },
    [choreography, router]
  );

  return { push, navigate, back: choreography.goBack };
}

export function useInteractiveTransition() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const navigateBack = useCallback(() => navigation.goBack(), [navigation]);

  return useInteractiveTransitionNavigator({
    navigateBack,
    routeParams: (route.params ?? {}) as Record<string, unknown>,
  });
}

export function ChoreographyScreen(
  props: ChoreographyScreenProps
): React.ReactElement {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const routeParams = (route.params ?? {}) as Record<string, unknown>;
  const dispatchingSelfRef = useRef(false);
  const interceptRemoval = useChoreographyScreenRemoval({
    screenId: props.screenId,
    legacyGroupId: routeParams._choreographyGroup as string | undefined,
    legacySourceScreenId: routeParams._choreographySourceScreen as
      | string
      | undefined,
  });

  useEffect(() => {
    return navigation.addListener('beforeRemove', (event: any) => {
      if (dispatchingSelfRef.current) {
        dispatchingSelfRef.current = false;
        return;
      }

      const intercepted = interceptRemoval(() => {
        dispatchingSelfRef.current = true;
        navigation.dispatch(event.data.action);
      });

      if (intercepted) {
        event.preventDefault();
      }
    });
  }, [interceptRemoval, navigation]);

  return React.createElement(ChoreographyScreenBase, props);
}

import React, { useCallback } from 'react';
import { useIsFocused, useNavigation, useRoute } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import {
  ChoreographyScreenBase,
  type ChoreographyScreenProps,
} from '../components/ChoreographyScreenBase';
import { isSingleRouteBack } from '../core/removalAction';
import { useChoreographyNavigator } from '../hooks/useChoreographyNavigation';
import { useChoreographyScreenRemoval } from '../hooks/useChoreographyScreenRemoval';
import { useInteractiveTransitionNavigator } from '../hooks/useInteractiveTransition';
import type { ChoreographyNavigationOptions } from '../types';

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
  const route = useRoute();
  const choreography = useChoreographyNavigator({
    currentScreenId,
    currentRouteKey: route.key,
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
  const navigation = useNavigation();
  const route = useRoute();
  const routeParams = (route.params ?? {}) as Record<string, unknown>;
  const { interceptRemoval, preventRemove, sourceScreenId, sourceRouteKey } =
    useChoreographyScreenRemoval({
      screenId: props.screenId,
      legacyGroupId: routeParams._choreographyGroup as string | undefined,
      legacySourceScreenId: routeParams._choreographySourceScreen as
        | string
        | undefined,
    });

  usePreventRemove(preventRemove, ({ data }) => {
    const resume = () => navigation.dispatch(data.action);
    const canAnimate = isSingleRouteBack(
      data.action,
      navigation.getState(),
      route.key,
      sourceScreenId,
      sourceRouteKey
    );
    const isRemoved = () =>
      !navigation
        .getState()
        ?.routes.some((candidate) => candidate.key === route.key);
    if (!interceptRemoval(resume, canAnimate, isRemoved)) resume();
  });

  return <ChoreographyScreenBase {...props} />;
}

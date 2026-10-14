import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused, useNavigation, useRoute } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import {
  ChoreographyScreenBase,
  type ChoreographyScreenProps,
} from '../components/ChoreographyScreenBase';
import { isSingleRouteBack } from '../core/removalAction';
import { waitForNavigationTarget } from '../core/navigationTarget';
import {
  createBackCommit,
  observeNavigationPresentation,
  type NavigationCommitSource,
  type NavigationCommitResult,
} from '../core/navigationCommit';
import { useChoreographyNavigator } from '../hooks/useChoreographyNavigation';
import { useChoreographyScreenRemoval } from '../hooks/useChoreographyScreenRemoval';
import { useInteractiveTransitionNavigator } from '../hooks/useInteractiveTransition';
import type { ChoreographyNavigateOptions } from '../types';

export interface ExpoRouterLike<Href> {
  push: (href: Href) => unknown;
  navigate: (href: Href) => unknown;
  back: () => unknown;
}

export type ChoreographyRouterRequest<Href> = ChoreographyNavigateOptions & {
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
  const navigation = useNavigation();
  const choreography = useChoreographyNavigator({
    currentScreenId: route.key ?? currentScreenId,
    currentRouteKey: route.key,
    isFocused,
    goBack: createBackCommit(
      navigation as unknown as NavigationCommitSource,
      route.key,
      () => router.back()
    ),
  });

  const push = useCallback(
    (request: ChoreographyRouterRequest<Href>) => {
      const { href, targetScreenId, ...options } = request;
      return choreography.navigate({
        targetScreenId,
        options,
        dispatchNavigation: () => router.push(href),
        resolveTargetScreenId: () =>
          waitForNavigationTarget(navigation, route.key),
      });
    },
    [choreography, navigation, route.key, router]
  );

  const navigate = useCallback(
    (request: ChoreographyRouterRequest<Href>) => {
      const { href, targetScreenId, ...options } = request;
      return choreography.navigate({
        targetScreenId,
        options,
        dispatchNavigation: () => router.navigate(href),
        resolveTargetScreenId: () =>
          waitForNavigationTarget(navigation, route.key),
      });
    },
    [choreography, navigation, route.key, router]
  );

  return { push, navigate, back: choreography.goBack };
}

export function useInteractiveTransition() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const navigateBack = useCallback(
    () => createBackCommit(navigation, route.key, () => navigation.goBack())(),
    [navigation, route.key]
  );

  return useInteractiveTransitionNavigator({
    navigateBack,
    currentScreenId: route.key,
    routeParams: (route.params ?? {}) as Record<string, unknown>,
  });
}

export function ChoreographyScreen(
  props: ChoreographyScreenProps
): React.ReactElement {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  useEffect(
    () =>
      observeNavigationPresentation(
        navigation as unknown as NavigationCommitSource
      ),
    [navigation]
  );
  const routeParams = (route.params ?? {}) as Record<string, unknown>;
  const { interceptRemoval, preventRemove, sourceScreenId, sourceRouteKey } =
    useChoreographyScreenRemoval({
      screenId: route.key,
      legacyGroupId: routeParams._choreographyGroup as string | undefined,
      legacySourceScreenId: routeParams._choreographySourceScreen as
        | string
        | undefined,
    });

  const [replayingRemoval, setReplayingRemoval] = useState(false);
  const replayResult = useRef<Promise<NavigationCommitResult> | null>(null);
  const disablePrevention = usePreventRemove(
    preventRemove && !replayingRemoval,
    ({ data }) => {
      const resume = () => {
        const result = createBackCommit(
          navigation as unknown as NavigationCommitSource,
          route.key,
          () => {
            if (typeof disablePrevention === 'function') {
              setReplayingRemoval(true);
              disablePrevention();
            }
            navigation.dispatch(data.action);
          }
        )();
        replayResult.current = result;
        return result;
      };
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
    }
  ) as void | (() => void);

  useEffect(() => {
    if (!replayingRemoval) return;
    let mounted = true;
    replayResult.current?.then(() => {
      if (mounted) setReplayingRemoval(false);
    });
    return () => {
      mounted = false;
    };
  }, [replayingRemoval]);

  return (
    <ChoreographyScreenBase
      {...props}
      instanceId={route.key}
      isFocused={isFocused}
    />
  );
}

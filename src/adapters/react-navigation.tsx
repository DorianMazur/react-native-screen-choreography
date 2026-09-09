import { useCallback, useEffect } from 'react';
import {
  useIsFocused,
  useNavigation,
  usePreventRemove,
  useRoute,
} from '@react-navigation/native';
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
} from '../core/navigationCommit';
import { useChoreographyNavigator } from '../hooks/useChoreographyNavigation';
import { useChoreographyScreenRemoval } from '../hooks/useChoreographyScreenRemoval';
import { useInteractiveTransitionNavigator } from '../hooks/useInteractiveTransition';
import type { ChoreographyNavigationOptions } from '../types';

export type { ChoreographyScreenProps } from '../components/ChoreographyScreenBase';

export function useChoreographyNavigation(navigation: any) {
  const route = useRoute();
  const isFocused = useIsFocused();
  const choreography = useChoreographyNavigator({
    currentScreenId: route.key,
    currentRouteKey: route.key,
    isFocused,
    goBack: createBackCommit(navigation, route.key, () => navigation.goBack()),
  });

  return {
    navigate: (
      screenName: string,
      params?: any,
      options?: ChoreographyNavigationOptions
    ) =>
      choreography.navigate({
        targetScreenId: screenName,
        options: {
          ...options,
          transitionConfig:
            options?.transitionConfig ??
            (params?.transitionGroup
              ? { group: params.transitionGroup }
              : undefined),
        },
        dispatchNavigation: () => navigation.navigate(screenName, params),
        resolveTargetScreenId: () =>
          waitForNavigationTarget(navigation, route.key, screenName),
      }),
    goBack: choreography.goBack,
  };
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

export function ChoreographyScreen(props: ChoreographyScreenProps) {
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

  usePreventRemove(preventRemove, ({ data }) => {
    const resume = createBackCommit(
      navigation as unknown as NavigationCommitSource,
      route.key,
      () => navigation.dispatch(data.action)
    );
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

  return (
    <ChoreographyScreenBase
      {...props}
      instanceId={route.key}
      isFocused={isFocused}
    />
  );
}

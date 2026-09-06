import { useCallback } from 'react';
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
import { useScreenId } from '../core/screenIdContext';
import { useChoreographyNavigator } from '../hooks/useChoreographyNavigation';
import { useChoreographyScreenRemoval } from '../hooks/useChoreographyScreenRemoval';
import { useInteractiveTransitionNavigator } from '../hooks/useInteractiveTransition';
import type { ChoreographyNavigationOptions } from '../types';

export type { ChoreographyScreenProps } from '../components/ChoreographyScreenBase';

export function useChoreographyNavigation(navigation: any) {
  const route = useRoute();
  const isFocused = useIsFocused();
  const screenId = useScreenId();
  const currentScreenId =
    screenId !== 'default'
      ? screenId
      : (route.name ??
        navigation.getState?.()?.routes?.[navigation.getState?.()?.index ?? 0]
          ?.name ??
        'default');
  const choreography = useChoreographyNavigator({
    currentScreenId,
    currentRouteKey: route.key,
    isFocused,
    goBack: () => navigation.goBack(),
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
      }),
    goBack: choreography.goBack,
  };
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

export function ChoreographyScreen(props: ChoreographyScreenProps) {
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

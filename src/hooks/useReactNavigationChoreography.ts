import { useIsFocused, useRoute } from '@react-navigation/native';
import { useScreenId } from '../core/screenIdContext';
import type { ChoreographyNavigationOptions } from '../types';
import { useChoreographyNavigator } from './useChoreographyNavigation';

/**
 * Adapts a React Navigation navigation object to choreography sessions.
 */
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

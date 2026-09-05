import { useCallback } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useInteractiveTransitionNavigator } from './useInteractiveTransition';

export function useInteractiveTransition() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const navigateBack = useCallback(() => navigation.goBack(), [navigation]);

  return useInteractiveTransitionNavigator({
    navigateBack,
    routeParams: (route.params ?? {}) as Record<string, unknown>,
  });
}

import type { ComponentType } from 'react';
import {
  useNavigation,
  useRoute,
  type RouteProp,
  type ParamListBase,
} from 'expo-router/react-navigation';

export function asTrayPage<N, R extends RouteProp<ParamListBase>>(
  Screen: ComponentType<{ navigation: N; route: R }>
) {
  return function Page() {
    const navigation = useNavigation<N>();
    const route = useRoute<R>();
    return <Screen navigation={navigation} route={route} />;
  };
}

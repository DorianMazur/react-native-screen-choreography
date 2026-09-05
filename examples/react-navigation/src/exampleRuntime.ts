import { useNavigation } from '@react-navigation/native';
import * as Choreography from 'react-native-screen-choreography';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  configureExampleRuntime,
  type DemoDetailDestination,
} from '../../shared/runtime';

configureExampleRuntime({
  ...Choreography,
  SafeAreaView,
  useSafeAreaInsets,
  useExampleNavigation: () => {
    const navigation = useNavigation<any>();
    const choreography = Choreography.useChoreographyNavigation(navigation);

    return {
      open: (screen) => navigation.navigate(screen),
      navigate: (destination: DemoDetailDestination, options = undefined) =>
        choreography.navigate(
          destination.screen,
          destination.params ?? {},
          options
        ),
      goBack: choreography.goBack,
    };
  },
});

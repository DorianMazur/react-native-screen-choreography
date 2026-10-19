import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ChoreographyScreen,
  useInteractiveTransition,
  useChoreographyNavigation,
} from 'react-native-screen-choreography';
import { ExampleBindings, type DemoScreenId } from '../../shared/runtime';

export type ExampleStackParams = {
  Landing: undefined;
  JournalList: undefined;
  JournalDetail: { collectionId: string };
  GalleryList: undefined;
  GalleryDetail: { photoId: string };
  TripsList: undefined;
  TripsDetail: { tripId: string };
  TokenList: undefined;
  TokenDetail: { tokenId: string };
};

function Bindings({ children }: { children: React.ReactNode }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<ExampleStackParams>>();
  const choreography = useChoreographyNavigation(navigation);
  const interactive = useInteractiveTransition();
  return (
    <ExampleBindings
      interactive={interactive}
      navigation={{
        open: (screen) => navigation.navigate(screen),
        navigate: (destination, options) =>
          choreography.navigate(
            destination.screen,
            destination.params,
            options
          ),
        goBack: choreography.goBack,
      }}
    >
      {children}
    </ExampleBindings>
  );
}

export function withExampleScreen<Props extends object>(
  screenId: DemoScreenId,
  Screen: React.ComponentType<Props>,
  options: { keepVisible?: boolean } = {}
) {
  return function ExampleScreen(props: Props) {
    return (
      <ChoreographyScreen screenId={screenId} {...options}>
        <Bindings>
          <Screen {...props} />
        </Bindings>
      </ChoreographyScreen>
    );
  };
}

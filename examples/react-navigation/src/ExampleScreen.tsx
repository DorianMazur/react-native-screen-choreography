import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ChoreographyScreen,
  useChoreographyNavigation,
  useInteractiveTransition,
} from 'react-native-screen-choreography';
import { ExampleBindings, type DemoScreenId } from '../../shared/runtime';

export type ExampleStackParams = {
  Landing: undefined;
  GalleryList: undefined;
  GalleryDetail: { photoId: string };
  MusicList: undefined;
  NowPlaying: { trackId: string };
  TokenList: undefined;
  TokenDetail: { tokenId: string };
  WalletSetup: undefined;
  WalletExisting: undefined;
};

function Bindings({ children }: { children: React.ReactNode }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<ExampleStackParams>>();
  const choreography = useChoreographyNavigation(navigation);
  const interactive = useInteractiveTransition();
  return (
    <ExampleBindings
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
      interactive={interactive}
    >
      {children}
    </ExampleBindings>
  );
}

export function withExampleScreen<Props extends object>(
  screenId: DemoScreenId,
  Screen: React.ComponentType<Props>
) {
  return function ExampleScreen(props: Props) {
    return (
      <ChoreographyScreen screenId={screenId}>
        <Bindings>
          <Screen {...props} />
        </Bindings>
      </ChoreographyScreen>
    );
  };
}

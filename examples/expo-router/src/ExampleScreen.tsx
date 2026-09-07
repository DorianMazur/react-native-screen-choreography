import React from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  ChoreographyScreen,
  useChoreographyRouter,
  useInteractiveTransition,
} from 'react-native-screen-choreography/expo-router';
import {
  ExampleBindings,
  type DemoScreenId,
  type DemoListScreenId,
  type DemoDetailDestination,
} from '../../shared/runtime';

const listRoutes = {
  GalleryList: '/gallery',
  MusicList: '/music',
  TokenList: '/wallet',
  WalletSetup: '/wallet-setup',
} satisfies Record<DemoListScreenId, Href>;

function detailRoute(destination: DemoDetailDestination): Href {
  switch (destination.screen) {
    case 'GalleryDetail':
      return { pathname: '/gallery/[photoId]', params: destination.params };
    case 'NowPlaying':
      return { pathname: '/music/[trackId]', params: destination.params };
    case 'TokenDetail':
      return { pathname: '/wallet/[tokenId]', params: destination.params };
    case 'WalletExisting':
      return '/wallet-setup/existing';
  }
}

function Bindings({
  screenId,
  children,
}: {
  screenId: DemoScreenId;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const choreography = useChoreographyRouter<Href>(router, screenId);
  const interactive = useInteractiveTransition();
  return (
    <ExampleBindings
      navigation={{
        open: (screen) => router.push(listRoutes[screen]),
        navigate: (destination, options) =>
          choreography.push({
            href: detailRoute(destination),
            targetScreenId: destination.screen,
            ...options,
          }),
        goBack: choreography.back,
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
        <Bindings screenId={screenId}>
          <Screen {...props} />
        </Bindings>
      </ChoreographyScreen>
    );
  };
}

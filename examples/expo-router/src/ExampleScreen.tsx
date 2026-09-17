import React from 'react';
import { useRouter, type Href } from 'expo-router';
import {
  ChoreographyScreen,
  useInteractiveTransition,
  useChoreographyRouter,
} from 'react-native-screen-choreography/expo-router';
import {
  ExampleBindings,
  type DemoScreenId,
  type DemoListScreenId,
  type DemoDetailDestination,
} from '../../shared/runtime';

const listRoutes = {
  GalleryList: '/gallery',
  TripsList: '/trips',
  TokenList: '/wallet',
} satisfies Record<DemoListScreenId, Href>;

function detailRoute(destination: DemoDetailDestination): Href {
  switch (destination.screen) {
    case 'GalleryDetail':
      return { pathname: '/gallery/[photoId]', params: destination.params };
    case 'TripsDetail':
      return { pathname: '/trips/[tripId]', params: destination.params };
    case 'TokenDetail':
      return { pathname: '/wallet/[tokenId]', params: destination.params };
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
      interactive={interactive}
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

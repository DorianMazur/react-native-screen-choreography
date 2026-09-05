import { useRouter } from 'expo-router';
import * as Choreography from 'react-native-screen-choreography/expo-router';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  configureExampleRuntime,
  type DemoDetailDestination,
  type DemoListScreenId,
} from '../../shared/runtime';

const listRoutes: Record<DemoListScreenId, string> = {
  GalleryList: '/gallery',
  MusicList: '/music',
  TokenList: '/wallet',
  LivePlayerList: '/live-player',
};

function getDetailRoute(destination: DemoDetailDestination) {
  switch (destination.screen) {
    case 'GalleryDetail':
      return {
        pathname: '/gallery/[photoId]',
        params: destination.params,
      };
    case 'NowPlaying':
      return {
        pathname: '/music/[trackId]',
        params: destination.params,
      };
    case 'TokenDetail':
      return {
        pathname: '/wallet/[tokenId]',
        params: destination.params,
      };
    case 'LivePlayerDetail':
      return '/live-player/detail';
  }
}

configureExampleRuntime({
  ...Choreography,
  SafeAreaView,
  useSafeAreaInsets,
  useExampleNavigation: (screenId) => {
    const router = useRouter();
    const choreography = Choreography.useChoreographyRouter(router, screenId);

    return {
      open: (screen) => router.push(listRoutes[screen] as never),
      navigate: (destination, options = undefined) =>
        choreography.push({
          href: getDetailRoute(destination) as never,
          targetScreenId: destination.screen,
          ...options,
        }),
      goBack: choreography.back,
    };
  },
});

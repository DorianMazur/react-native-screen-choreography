import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { ChoreographyProvider } from 'react-native-screen-choreography';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { withExampleScreen, type ExampleStackParams } from './ExampleScreen';
import { LandingScreen } from '../../shared/LandingScreen';
import { GalleryListScreen } from '../../shared/gallery/GalleryListScreen';
import { GalleryDetailScreen } from '../../shared/gallery/GalleryDetailScreen';
import { LivePlayerListScreen } from '../../shared/live/LivePlayerListScreen';
import { LivePlayerDetailScreen } from '../../shared/live/LivePlayerDetailScreen';
import { MusicListScreen } from '../../shared/music/MusicListScreen';
import { NowPlayingScreen } from '../../shared/music/NowPlayingScreen';
import { theme as palette } from '../../shared/theme';
import { TokenListScreen } from '../../shared/wallet/TokenListScreen';
import { TokenDetailScreen } from '../../shared/wallet/TokenDetailScreen';

const Stack = createNativeStackNavigator<ExampleStackParams>();
const LandingRoute = withExampleScreen('Landing', LandingScreen);
const GalleryListRoute = withExampleScreen('GalleryList', GalleryListScreen);
const MusicListRoute = withExampleScreen('MusicList', MusicListScreen);
const TokenListRoute = withExampleScreen('TokenList', TokenListScreen);
const LivePlayerListRoute = withExampleScreen(
  'LivePlayerList',
  LivePlayerListScreen
);
const LivePlayerDetailRoute = withExampleScreen(
  'LivePlayerDetail',
  LivePlayerDetailScreen
);

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: palette.bg,
    card: palette.bg,
    text: palette.text,
    border: palette.border,
    primary: palette.accent,
  },
};

const detailOptions = {
  presentation: 'containedTransparentModal' as const,
  contentStyle: { backgroundColor: 'transparent' },
  gestureEnabled: false,
};

const GalleryDetailRoute = withExampleScreen(
  'GalleryDetail',
  function GalleryDetailRoute({
    route,
  }: NativeStackScreenProps<ExampleStackParams, 'GalleryDetail'>) {
    return <GalleryDetailScreen photoId={route.params?.photoId} />;
  }
);

const NowPlayingRoute = withExampleScreen(
  'NowPlaying',
  function NowPlayingRoute({
    route,
  }: NativeStackScreenProps<ExampleStackParams, 'NowPlaying'>) {
    return <NowPlayingScreen trackId={route.params?.trackId} />;
  }
);

const TokenDetailRoute = withExampleScreen(
  'TokenDetail',
  function TokenDetailRoute({
    route,
  }: NativeStackScreenProps<ExampleStackParams, 'TokenDetail'>) {
    return <TokenDetailScreen tokenId={route.params?.tokenId} />;
  }
);

export default function App() {
  return (
    <SafeAreaProvider>
      <ChoreographyProvider debug={false}>
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'none',
              contentStyle: { backgroundColor: palette.bg },
            }}
          >
            <Stack.Screen name="Landing" component={LandingRoute} />

            <Stack.Screen name="GalleryList" component={GalleryListRoute} />
            <Stack.Screen
              name="GalleryDetail"
              component={GalleryDetailRoute}
              options={detailOptions}
            />

            <Stack.Screen name="MusicList" component={MusicListRoute} />
            <Stack.Screen
              name="NowPlaying"
              component={NowPlayingRoute}
              options={detailOptions}
            />

            <Stack.Screen name="TokenList" component={TokenListRoute} />
            <Stack.Screen
              name="TokenDetail"
              component={TokenDetailRoute}
              options={detailOptions}
            />

            <Stack.Screen
              name="LivePlayerList"
              component={LivePlayerListRoute}
            />
            <Stack.Screen
              name="LivePlayerDetail"
              component={LivePlayerDetailRoute}
              options={detailOptions}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ChoreographyProvider>
    </SafeAreaProvider>
  );
}

import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChoreographyProvider } from 'react-native-screen-choreography';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../../shared/runtime';
import './exampleRuntime';
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

const Stack = createNativeStackNavigator();

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
};

function GalleryDetailRoute({ route }: { route: any }) {
  return <GalleryDetailScreen photoId={route.params?.photoId} />;
}

function NowPlayingRoute({ route }: { route: any }) {
  return <NowPlayingScreen trackId={route.params?.trackId} />;
}

function TokenDetailRoute({ route }: { route: any }) {
  return <TokenDetailScreen tokenId={route.params?.tokenId} />;
}

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
            <Stack.Screen name="Landing" component={LandingScreen} />

            <Stack.Screen name="GalleryList" component={GalleryListScreen} />
            <Stack.Screen
              name="GalleryDetail"
              component={GalleryDetailRoute}
              options={detailOptions}
            />

            <Stack.Screen name="MusicList" component={MusicListScreen} />
            <Stack.Screen
              name="NowPlaying"
              component={NowPlayingRoute}
              options={detailOptions}
            />

            <Stack.Screen name="TokenList" component={TokenListScreen} />
            <Stack.Screen
              name="TokenDetail"
              component={TokenDetailRoute}
              options={detailOptions}
            />

            <Stack.Screen
              name="LivePlayerList"
              component={LivePlayerListScreen}
            />
            <Stack.Screen
              name="LivePlayerDetail"
              component={LivePlayerDetailScreen}
              options={detailOptions}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ChoreographyProvider>
    </SafeAreaProvider>
  );
}

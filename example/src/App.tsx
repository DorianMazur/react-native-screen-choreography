import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChoreographyProvider } from 'react-native-screen-choreography';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme as palette } from './theme';
import { LandingScreen } from './LandingScreen';
import { TokenListScreen } from './wallet/TokenListScreen';
import { TokenDetailScreen } from './wallet/TokenDetailScreen';
import { GalleryListScreen } from './gallery/GalleryListScreen';
import { GalleryDetailScreen } from './gallery/GalleryDetailScreen';
import { MusicListScreen } from './music/MusicListScreen';
import { NowPlayingScreen } from './music/NowPlayingScreen';

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
              component={GalleryDetailScreen}
              options={detailOptions}
            />

            <Stack.Screen name="MusicList" component={MusicListScreen} />
            <Stack.Screen
              name="NowPlaying"
              component={NowPlayingScreen}
              options={detailOptions}
            />

            <Stack.Screen name="TokenList" component={TokenListScreen} />
            <Stack.Screen
              name="TokenDetail"
              component={TokenDetailScreen}
              options={detailOptions}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ChoreographyProvider>
    </SafeAreaProvider>
  );
}

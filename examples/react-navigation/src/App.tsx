import { KeyboardProvider } from 'react-native-keyboard-controller';
import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { ChoreographyProvider } from 'react-native-screen-choreography';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { withExampleScreen, type ExampleStackParams } from './ExampleScreen';
import { LandingScreen } from '@screen-choreography/example-shared/landing';
import {
  GalleryListScreen,
  GalleryDetailScreen,
} from '@screen-choreography/example-shared/gallery';
import { theme as palette } from '@screen-choreography/example-shared';
import {
  TokenListScreen,
  TokenDetailScreen,
} from '@screen-choreography/example-shared/wallet';
import { DemoTraysProvider } from '@screen-choreography/example-shared/tray';
import { JSStressMenu } from '@screen-choreography/example-shared/performance';

import {
  TripsListScreen,
  TripsDetailScreen,
} from '@screen-choreography/example-shared/trips';

const Stack = createNativeStackNavigator<ExampleStackParams>();
const LandingRoute = withExampleScreen('Landing', LandingScreen);
const GalleryListRoute = withExampleScreen('GalleryList', GalleryListScreen);
const TripsListRoute = withExampleScreen('TripsList', TripsListScreen);
const TripsDetailRoute = withExampleScreen(
  'TripsDetail',
  function TripsDetailRoute({
    route,
  }: NativeStackScreenProps<ExampleStackParams, 'TripsDetail'>) {
    return <TripsDetailScreen tripId={route.params?.tripId} />;
  }
);
const TokenListRoute = withExampleScreen('TokenList', TokenListScreen);

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
    <KeyboardProvider>
      <SafeAreaProvider>
        <ChoreographyProvider debug={false}>
          <DemoTraysProvider>
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

                <Stack.Screen name="TripsList" component={TripsListRoute} />
                <Stack.Screen
                  name="TripsDetail"
                  component={TripsDetailRoute}
                  options={detailOptions}
                />

                <Stack.Screen name="TokenList" component={TokenListRoute} />
                <Stack.Screen
                  name="TokenDetail"
                  component={TokenDetailRoute}
                  options={detailOptions}
                />
              </Stack.Navigator>
            </NavigationContainer>
          </DemoTraysProvider>
          {__DEV__ && false && <JSStressMenu />}
        </ChoreographyProvider>
      </SafeAreaProvider>
    </KeyboardProvider>
  );
}

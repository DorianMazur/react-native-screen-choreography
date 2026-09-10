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
import { theme as palette } from '../../shared/theme';
import { TokenListScreen } from '../../shared/wallet/TokenListScreen';
import { TokenDetailScreen } from '../../shared/wallet/TokenDetailScreen';
import {
  WalletSetupScreen,
  WalletExistingScreen,
} from '../../shared/wallet-setup/WalletSetupScreens';

const Stack = createNativeStackNavigator<ExampleStackParams>();
const LandingRoute = withExampleScreen('Landing', LandingScreen);
const GalleryListRoute = withExampleScreen('GalleryList', GalleryListScreen);
const TokenListRoute = withExampleScreen('TokenList', TokenListScreen);
const WalletSetupRoute = withExampleScreen('WalletSetup', WalletSetupScreen);
const WalletExistingRoute = withExampleScreen(
  'WalletExisting',
  WalletExistingScreen
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

            <Stack.Screen name="TokenList" component={TokenListRoute} />
            <Stack.Screen
              name="TokenDetail"
              component={TokenDetailRoute}
              options={detailOptions}
            />

            <Stack.Screen name="WalletSetup" component={WalletSetupRoute} />
            <Stack.Screen
              name="WalletExisting"
              component={WalletExistingRoute}
              options={detailOptions}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ChoreographyProvider>
    </SafeAreaProvider>
  );
}

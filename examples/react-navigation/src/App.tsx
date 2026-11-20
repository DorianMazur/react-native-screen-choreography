import {
  DarkTheme,
  NavigationContainer,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  createTrayNavigator,
  trayStackLayout,
} from 'react-native-screen-choreography';
import { LandingScreen } from '@screen-choreography/example-shared/landing';
import {
  makeWalletTray,
  makeGalleryTray,
  type WalletTrayRoutes,
  type GalleryTrayRoutes,
} from '@screen-choreography/example-shared/tray';

type Routes = {
  Home: undefined;
  WalletTray: NavigatorScreenParams<WalletTrayRoutes> | undefined;
  GalleryTray: NavigatorScreenParams<GalleryTrayRoutes> | undefined;
};
const Root = createNativeStackNavigator<Routes>();
const WalletTray = makeWalletTray(createTrayNavigator);
const GalleryTray = makeGalleryTray(createTrayNavigator);
function Home({ navigation }: NativeStackScreenProps<Routes, 'Home'>) {
  return (
    <LandingScreen
      openWallet={() => navigation.navigate('WalletTray')}
      openGallery={() => navigation.navigate('GalleryTray')}
    />
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <NavigationContainer theme={DarkTheme}>
          <Root.Navigator
            layout={trayStackLayout}
            screenOptions={{ headerShown: false }}
          >
            <Root.Screen name="Home" component={Home} />
            <Root.Screen name="WalletTray" component={WalletTray} />
            <Root.Screen name="GalleryTray" component={GalleryTray} />
          </Root.Navigator>
        </NavigationContainer>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

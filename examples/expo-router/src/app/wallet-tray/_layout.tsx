import { withLayoutContext } from 'expo-router';
import { createTrayNavigator } from 'react-native-screen-choreography/expo-router';
import {
  useWalletTrayOptions,
  walletPages,
  type WalletTrayRoutes,
} from '@screen-choreography/example-shared/tray/wallet';

export const unstable_settings = { initialRouteName: 'actions' };
const Tray = withLayoutContext(
  createTrayNavigator<WalletTrayRoutes>().Navigator
);
export default function Layout() {
  const options = useWalletTrayOptions();
  return (
    <Tray {...options}>
      <Tray.Screen name="actions" options={walletPages.actions} />
      <Tray.Screen name="send" options={walletPages.send} />
      <Tray.Screen name="recipient" options={walletPages.recipient} />
      <Tray.Screen name="review" options={walletPages.review} />
      <Tray.Screen name="success" options={walletPages.success} />
      <Tray.Screen name="settings" options={walletPages.settings} />
    </Tray>
  );
}

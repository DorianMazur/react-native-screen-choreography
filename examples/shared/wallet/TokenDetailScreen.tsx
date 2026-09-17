import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import {
  useChoreographyControls,
  useExampleNavigation,
  useSafeAreaInsets,
} from '../runtime';
import { TOKENS } from './data';
import { walletTransition } from './walletTransitions';
import { useWalletDismiss } from './useWalletDismiss';
import type { WalletCardActions } from './WalletCard';

const websites: Record<string, string> = {
  polygon: 'https://polygon.technology',
  ethereum: 'https://ethereum.org',
  bitcoin: 'https://bitcoin.org',
  solana: 'https://solana.com',
  avalanche: 'https://avax.network',
  chainlink: 'https://chain.link',
};

export function TokenDetailScreen({
  tokenId = 'polygon',
}: {
  tokenId?: string;
}) {
  const token = TOKENS.find((item) => item.id === tokenId) ?? TOKENS[0]!;
  const { goBack } = useExampleNavigation();
  const { settleTransition } = useChoreographyControls();
  const insets = useSafeAreaInsets();
  const panHandlers = useWalletDismiss(token.id);
  const onBack = () => goBack(walletTransition.navigationOptions);
  const actions: WalletCardActions = {
    settleTransition,
    openWebsite: () => {
      settleTransition();
      const url = websites[token.id];
      if (url)
        Linking.openURL(url).catch(() => {
          Alert.alert('Unable to open website', 'Please try again later.');
        });
    },
  };
  return (
    <View style={styles.screen}>
      <walletTransition.Element.Target
        name="card"
        groupId={`token.${token.id}`}
        metadata={actions}
        style={StyleSheet.absoluteFill}
      />
      {/* The visible handle travels inside the retained card; this stationary
          touch surface keeps the gesture on the route while it is in the overlay. */}
      <View
        {...panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Dismiss asset overview"
        accessibilityHint="Drag down to return to the wallet, or double tap."
        onAccessibilityTap={onBack}
        testID="wallet-dismiss-handle"
        style={[styles.handleTouchArea, { top: insets.top }]}
      />
      {/* Like Trips, keep Back's touch target on the route so it can interrupt
          the opening animation while the visible arrow is in the overlay. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to wallet"
        testID="wallet-back"
        onPress={onBack}
        style={[styles.backTouchArea, { top: insets.top + 38 }]}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  backTouchArea: {
    position: 'absolute',
    left: 14,
    width: 44,
    height: 44,
  },
  handleTouchArea: {
    position: 'absolute',
    alignSelf: 'center',
    width: 112,
    height: 32,
  },
});

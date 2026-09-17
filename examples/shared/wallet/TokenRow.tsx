import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from '../runtime';
import type { Token } from './data';
import { WalletCard } from './WalletCard';
import { walletTransition } from './walletTransitions';

export function TokenRow({
  token,
  onPress,
}: {
  token: Token;
  onPress: () => void;
}) {
  const dimensions = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.row}>
      <walletTransition.Element
        name="card"
        groupId={`token.${token.id}`}
        style={styles.card}
      >
        <WalletCard
          token={token}
          width={dimensions.width - 32}
          height={dimensions.height}
          topInset={insets.top}
          bottomInset={insets.bottom}
        />
      </walletTransition.Element>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${token.name}`}
        onPress={onPress}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  row: { height: 92, marginHorizontal: 16, marginBottom: 10 },
  card: { flex: 1, borderRadius: 16 },
});

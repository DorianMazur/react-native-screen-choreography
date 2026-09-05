import { useLocalSearchParams } from 'expo-router';
import { TokenDetailScreen } from '../../../../shared/wallet/TokenDetailScreen';

export default function TokenDetailRoute() {
  const { tokenId } = useLocalSearchParams<{ tokenId: string }>();
  return <TokenDetailScreen tokenId={tokenId} />;
}

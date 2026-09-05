import { useLocalSearchParams } from 'expo-router';
import { withExampleScreen } from '../../ExampleScreen';
import { TokenDetailScreen } from '../../../../shared/wallet/TokenDetailScreen';

function TokenDetailRoute() {
  const { tokenId } = useLocalSearchParams<{ tokenId: string }>();
  return <TokenDetailScreen tokenId={tokenId} />;
}
export default withExampleScreen('TokenDetail', TokenDetailRoute);

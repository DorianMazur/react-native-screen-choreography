import { useLocalSearchParams } from 'expo-router';
import { JournalDetailScreen } from '@screen-choreography/example-shared/journal';
import { withExampleScreen } from '../../ExampleScreen';

function JournalDetailRoute() {
  const { collectionId } = useLocalSearchParams<{
    collectionId: string;
  }>();
  return <JournalDetailScreen collectionId={collectionId} />;
}
export default withExampleScreen('JournalDetail', JournalDetailRoute, {
  keepVisible: true,
});

import { useLocalSearchParams } from 'expo-router';
import { DaylightDetailScreen } from '@screen-choreography/example-shared/daylight';
import { withExampleScreen } from '../../ExampleScreen';

function JournalDetailRoute() {
  const { collectionId } = useLocalSearchParams<{
    collectionId: string;
  }>();
  return <DaylightDetailScreen collectionId={collectionId} />;
}
export default withExampleScreen('JournalDetail', JournalDetailRoute, {
  keepVisible: true,
});

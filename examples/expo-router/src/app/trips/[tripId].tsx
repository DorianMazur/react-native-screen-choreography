import { useLocalSearchParams } from 'expo-router';
import { withExampleScreen } from '../../ExampleScreen';
import { TripsDetailScreen } from '@screen-choreography/example-shared/trips';

function TripsDetailRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <TripsDetailScreen tripId={tripId} />;
}
export default withExampleScreen('TripsDetail', TripsDetailRoute);

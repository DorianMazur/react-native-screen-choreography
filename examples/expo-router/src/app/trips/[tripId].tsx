import { useLocalSearchParams } from 'expo-router';
import { withExampleScreen } from '../../ExampleScreen';
import { TripsDetailScreen } from '../../../../shared/trips/TripsScreens';

function TripsDetailRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <TripsDetailScreen tripId={tripId} />;
}
export default withExampleScreen('TripsDetail', TripsDetailRoute);

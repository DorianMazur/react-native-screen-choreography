import { useLocalSearchParams } from 'expo-router';
import { withExampleScreen } from '../../ExampleScreen';
import { NowPlayingScreen } from '../../../../shared/music/NowPlayingScreen';

function NowPlayingRoute() {
  const { trackId } = useLocalSearchParams<{ trackId: string }>();
  return <NowPlayingScreen trackId={trackId} />;
}
export default withExampleScreen('NowPlaying', NowPlayingRoute);

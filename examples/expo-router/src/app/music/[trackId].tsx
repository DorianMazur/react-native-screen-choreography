import { useLocalSearchParams } from 'expo-router';
import { NowPlayingScreen } from '../../../../shared/music/NowPlayingScreen';

export default function NowPlayingRoute() {
  const { trackId } = useLocalSearchParams<{ trackId: string }>();
  return <NowPlayingScreen trackId={trackId} />;
}

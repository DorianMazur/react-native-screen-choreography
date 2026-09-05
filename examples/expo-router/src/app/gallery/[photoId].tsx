import { useLocalSearchParams } from 'expo-router';
import { withExampleScreen } from '../../ExampleScreen';
import { GalleryDetailScreen } from '../../../../shared/gallery/GalleryDetailScreen';

function GalleryDetailRoute() {
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  return <GalleryDetailScreen photoId={photoId} />;
}
export default withExampleScreen('GalleryDetail', GalleryDetailRoute);

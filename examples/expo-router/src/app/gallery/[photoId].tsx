import { useLocalSearchParams } from 'expo-router';
import { withExampleScreen } from '../../ExampleScreen';
import { GalleryDetailScreen } from '@screen-choreography/example-shared/gallery';

function GalleryDetailRoute() {
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  return <GalleryDetailScreen photoId={photoId} />;
}
export default withExampleScreen('GalleryDetail', GalleryDetailRoute);

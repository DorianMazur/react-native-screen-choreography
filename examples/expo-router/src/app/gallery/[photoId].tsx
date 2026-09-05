import { useLocalSearchParams } from 'expo-router';
import { GalleryDetailScreen } from '../../../../shared/gallery/GalleryDetailScreen';

export default function GalleryDetailRoute() {
  const { photoId } = useLocalSearchParams<{ photoId: string }>();
  return <GalleryDetailScreen photoId={photoId} />;
}

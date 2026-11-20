import { withLayoutContext } from 'expo-router';
import { createTrayNavigator } from 'react-native-screen-choreography/expo-router';
import {
  useGalleryTrayOptions,
  galleryPages,
  type GalleryTrayRoutes,
} from '@screen-choreography/example-shared/tray/gallery';

export const unstable_settings = { initialRouteName: 'intro' };
const Tray = withLayoutContext(
  createTrayNavigator<GalleryTrayRoutes>().Navigator
);
export default function Layout() {
  const options = useGalleryTrayOptions();
  return (
    <Tray {...options}>
      <Tray.Screen name="intro" options={galleryPages.intro} />
      <Tray.Screen name="plans" options={galleryPages.plans} />
      <Tray.Screen name="details" options={galleryPages.details} />
      <Tray.Screen name="preview" options={galleryPages.preview} />
    </Tray>
  );
}

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { createBlankStackNavigator } from 'react-native-screen-transitions/react-navigation';
import { GalleryListScreen } from './GalleryListScreen';
import { GalleryDetailScreen } from './GalleryDetailScreen';
import { galleryOptions } from './galleryTransition';

export type GalleryStackParams = {
  Photos: undefined;
  Photo: { photoId: string };
};

const Stack = createBlankStackNavigator<GalleryStackParams>();

export function ScreenTransitionsGallery() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Navigator screenOptions={{ gestureEnabled: false }}>
        <Stack.Screen name="Photos" component={GalleryListScreen} />
        <Stack.Screen
          name="Photo"
          component={GalleryDetailScreen}
          options={galleryOptions}
        />
      </Stack.Navigator>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

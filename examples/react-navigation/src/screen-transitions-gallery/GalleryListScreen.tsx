import { GalleryHero } from './GalleryHero';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Transition from 'react-native-screen-transitions';
import type { BlankStackScreenProps } from 'react-native-screen-transitions/react-navigation';
import type { GalleryStackParams } from './GalleryNavigator';
import { ScreenHeader } from '../../../shared/AppChrome';
import { theme } from '../../../shared/theme';
import { PHOTOS, type Photo } from '../../../shared/gallery/data';

const TILE_GAP = 12;

export function GalleryListScreen({
  navigation,
}: BlankStackScreenProps<GalleryStackParams, 'Photos'>) {
  const { width } = useWindowDimensions();
  const tileWidth = (width - 48 - TILE_GAP) / 2;

  return (
    <>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScreenHeader title="Gallery" onBack={() => navigation.goBack()} />
        <View style={styles.header}>
          <Text style={styles.eyebrow}>THE FIELD JOURNAL</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Field notes
          </Text>
          <View style={styles.summary}>
            <Text style={styles.subtitle}>Places worth keeping</Text>
            <Text style={styles.count}>{PHOTOS.length} PHOTOS</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {PHOTOS.map((photo) => (
            <Tile
              key={photo.id}
              photo={photo}
              width={tileWidth}
              onPress={() =>
                navigation.navigate('Photo', { photoId: photo.id })
              }
            />
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function Tile({
  photo,
  width,
  onPress,
}: {
  photo: Photo;
  width: number;
  onPress: () => void;
}) {
  return (
    <Transition.Boundary
      id={`photo.${photo.id}`}
      handoff
      accessibilityRole="button"
      accessibilityLabel={`View ${photo.title}`}
      onPress={onPress}
      style={[styles.tileWrapper, { width }]}
    >
      <Transition.Boundary.Target style={{ width, height: width / 0.72 }}>
        <GalleryHero photo={photo} width={width} height={width / 0.72} />
      </Transition.Boundary.Target>
    </Transition.Boundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  eyebrow: {
    fontFamily: theme.font,
    fontSize: 10,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  count: {
    fontFamily: theme.numbers,
    fontSize: 10,
    color: theme.gallery.accent,
  },
  title: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 30,
    fontWeight: '600',
    marginTop: 10,
  },
  subtitle: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 12,
  },
  grid: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tileWrapper: {
    aspectRatio: 0.72,
  },
});

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Modal,
  Share,
  StatusBar,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Transition from 'react-native-screen-transitions';
import type { BlankStackScreenProps } from 'react-native-screen-transitions/react-navigation';
import type { GalleryStackParams } from './GalleryNavigator';
import { AppIcon, IconButton, ScreenHeader } from '../../../shared/AppChrome';
import { theme } from '../../../shared/theme';
import { PHOTOS } from '../../../shared/gallery/data';

export function GalleryDetailScreen({
  navigation,
  route,
}: BlankStackScreenProps<GalleryStackParams, 'Photo'>) {
  const { photoId } = route.params;
  const photo = PHOTOS.find((item) => item.id === photoId) ?? PHOTOS[0]!;
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <>
      <View
        style={[
          styles.screen,
          // Bounds must include safe-area padding on the first measured mount.
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <Transition.View
          pointerEvents="none"
          styleId="gallery-background"
          style={[StyleSheet.absoluteFill, styles.container]}
        />
        <StatusBar barStyle="light-content" />
        <Transition.View styleId="gallery-header">
          <ScreenHeader
            title="Field notes"
            onBack={() => navigation.goBack()}
            backLabel="Back to gallery"
          />
        </Transition.View>
        <Transition.ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Transition.Boundary
            id={`photo.${photo.id}`}
            handoff
            style={styles.frame}
          >
            {/* Reserve the final layout while the receiver animates inside it. */}
            <Transition.Boundary.Target style={StyleSheet.absoluteFill} />
          </Transition.Boundary>

          <Transition.View styleId="gallery-details">
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Notes</Text>
              <Text style={styles.body}>{photo.description}</Text>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Exposure</Text>
              <View style={styles.exifRow}>
                <ExifChip label="ISO" value={photo.iso.replace('ISO ', '')} />
                <ExifChip label="Shutter" value={photo.shutter} />
                <ExifChip label="Aperture" value={photo.aperture} />
              </View>
            </View>

            <View style={[styles.section, styles.actionRow]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View full photo"
                onPress={() => setLightboxVisible(true)}
                style={styles.primaryAction}
              >
                <AppIcon name="expand" size={18} color={theme.ink} />
                <Text style={styles.primaryActionText}>View photo</Text>
              </Pressable>
              <IconButton
                icon="share"
                label="Share photo notes"
                onPress={() => {
                  Share.share({
                    message: `${photo.title} - ${photo.location}\n\n${photo.description}`,
                  }).catch(() => {});
                }}
              />
            </View>
          </Transition.View>
        </Transition.ScrollView>
        <Modal
          visible={lightboxVisible}
          animationType="fade"
          onRequestClose={() => setLightboxVisible(false)}
        >
          <SafeAreaView style={styles.container}>
            <ScreenHeader
              title={photo.title}
              onBack={() => setLightboxVisible(false)}
              backLabel="Close full photo"
            />
            <Image
              source={photo.image}
              accessibilityLabel={photo.title}
              resizeMode="contain"
              style={styles.lightbox}
            />
          </SafeAreaView>
        </Modal>
      </View>
    </>
  );
}

function ExifChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.exifChip}>
      <Text style={styles.exifLabel}>{label}</Text>
      <Text style={styles.exifValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  scroll: {
    paddingBottom: 40,
  },
  frame: {
    width: '100%',
    aspectRatio: 1,
  },
  lightbox: { flex: 1, width: '100%' },
  section: {
    marginHorizontal: 24,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sectionTitle: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  body: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  exifRow: {
    flexDirection: 'row',
    gap: 10,
  },
  exifChip: {
    flex: 1,
    paddingTop: 12,
  },
  exifLabel: {
    fontFamily: theme.font,
    color: theme.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  exifValue: {
    fontFamily: theme.numbers,
    color: theme.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryActionText: {
    fontFamily: theme.font,
    color: theme.ink,
    fontWeight: '600',
    fontSize: 15,
  },
});

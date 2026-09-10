import { useEffect } from 'react';
import type { GalleryObservation } from './GalleryListScreen';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import { useSharedElementPresentation } from '../runtime';
import { AppIcon } from '../AppChrome';
import { theme } from '../theme';
import { GalleryLivePhoto } from './GalleryLivePhoto';
import { interpolateHero } from './galleryHeroGeometry';
import type { Photo } from './data';

export function GalleryHero({
  photo,
  width: initialWidth,
  height: initialHeight,
  observation,
}: {
  photo: Photo;
  width: number;
  height: number;
  observation?: GalleryObservation;
}) {
  useEffect(() => observation?.mounted(photo.id), [observation, photo.id]);
  const { progress, transitioning, settled, collapsed, expanded } =
    useSharedElementPresentation();
  const from = {
    width: collapsed.metrics?.width ?? initialWidth,
    height: collapsed.metrics?.height ?? initialHeight,
    expansion: 0,
  };
  const to = {
    width: expanded.metrics?.width ?? initialWidth,
    height: expanded.metrics?.height ?? initialHeight,
    expansion: 1,
  };
  const frame = useDerivedValue(() =>
    interpolateHero(
      from,
      to,
      transitioning ? progress.value : settled === 'expanded' ? 1 : 0
    )
  );
  const frameStyle = useAnimatedStyle(() => ({
    width: frame.value.width,
    height: frame.value.height,
    borderRadius: theme.radius.lg * (1 - frame.value.expansion),
  }));
  const scrimStyle = useAnimatedStyle(() => {
    const { width, height } = frame.value;
    return {
      transform: [
        { translateY: height * 0.45 },
        { scaleX: width / 800 },
        { scaleY: (height * 0.55) / 800 },
      ],
    };
  });
  const titleStyle = useAnimatedStyle(() => {
    const { height, expansion: t } = frame.value;
    const scale = 0.5 + 0.5 * t;
    const subtitleScale = 11 / 15 + (1 - 11 / 15) * t;
    return {
      transform: [
        { translateX: 12 + 12 * t },
        {
          translateY:
            height -
            (10 + 14 * t) -
            22 * subtitleScale -
            (2 + 2 * t) -
            40 * scale,
        },
        { scale },
      ],
    };
  });
  const locationStyle = useAnimatedStyle(() => {
    const { height, expansion: t } = frame.value;
    const scale = 11 / 15 + (1 - 11 / 15) * t;
    return {
      transform: [
        { translateX: 12 + 12 * t },
        { translateY: height - (10 + 14 * t) - 22 * scale },
        { scale },
      ],
    };
  });
  const glyphStyle = useAnimatedStyle(() => {
    const { width, expansion: t } = frame.value;
    const scale = 2 / 3 + t / 3;
    return {
      transform: [
        { translateX: width - (10 + 8 * t) - 42 * scale },
        { translateY: 10 + 8 * t },
        { scale },
      ],
    };
  });
  return (
    <Animated.View collapsable={false} style={[styles.frame, frameStyle]}>
      <GalleryLivePhoto
        source={photo.image}
        viewport={frame}
        onLoad={observation ? () => observation.loaded(photo.id) : undefined}
        onError={observation ? () => observation.failed(photo.id) : undefined}
      />
      <Animated.View pointerEvents="none" style={[styles.scrim, scrimStyle]} />
      <Animated.View style={[styles.glyph, glyphStyle]}>
        <AppIcon name="camera" size={21} />
      </Animated.View>
      <Animated.View style={[styles.titleBox, titleStyle]}>
        <Text numberOfLines={1} style={styles.title}>
          {photo.title}
        </Text>
      </Animated.View>
      <Animated.View style={[styles.locationBox, locationStyle]}>
        <Text numberOfLines={1} style={styles.location}>
          {photo.location}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    backgroundColor: theme.surface,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 800,
    height: 800,
    transformOrigin: 'top left',
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)',
  },
  glyph: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 42,
    height: 42,
    transformOrigin: 'top left',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBox: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 800,
    height: 40,
    transformOrigin: 'top left',
  },
  locationBox: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 800,
    height: 22,
    transformOrigin: 'top left',
  },
  title: {
    fontFamily: theme.font,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '600',
    color: theme.text,
    includeFontPadding: false,
  },
  location: {
    fontFamily: theme.font,
    fontSize: 15,
    lineHeight: 22,
    color: theme.text,
    includeFontPadding: false,
  },
});

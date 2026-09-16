import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import {
  useSharedElementPresentation,
  useChoreographyProgress,
} from '../runtime';
import { theme } from '../theme';
import { AppIcon } from '../AppChrome';
import type { Trip } from './data';
import type { TripPickupMetadata } from './tripPickup';
import {
  tripHorizontalProgress,
  tripActivityProgress,
  tripContentOffset,
  tripPhotoGeometry,
} from './tripGeometry';

const ACTIVITY_CARD_WIDTH = 184;
const ACTIVITY_CARD_PADDING = 16;
const MAP_WIDTH = ACTIVITY_CARD_WIDTH - 2 * ACTIVITY_CARD_PADDING - 2;

/** One retained scene: photo and heading never swap during the transition. */
export function TripHero({
  trip,
  width,
  height,
  topInset,
  bottomInset,
}: {
  trip: Trip;
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
}) {
  const { progress, transitioning, settled, collapsed, expanded } =
    useSharedElementPresentation();
  const { direction } = useChoreographyProgress();
  const backward = transitioning && direction === 'backward';
  const reduceMotion = useReducedMotion();
  const fromWidth = collapsed.metrics?.width ?? width;
  const fromHeight = collapsed.metrics?.height ?? height;
  const toWidth = expanded.metrics?.width ?? width;
  const toHeight = expanded.metrics?.height ?? height;
  const fromX = collapsed.metrics?.pageX ?? 0;
  const toX = expanded.metrics?.pageX ?? fromX;
  const amount = useDerivedValue(() =>
    transitioning
      ? Math.max(0, Math.min(1, progress.value))
      : settled === 'expanded'
        ? 1
        : 0
  );
  const frame = useDerivedValue(() => ({
    width:
      fromWidth + (toWidth - fromWidth) * tripHorizontalProgress(amount.value),
    height: fromHeight + (toHeight - fromHeight) * amount.value,
  }));
  const frameStyle = useAnimatedStyle(() => ({
    ...frame.value,
    borderRadius: theme.radius.lg * (1 - tripHorizontalProgress(amount.value)),
  }));
  const asset = Image.resolveAssetSource(trip.image);
  const imageWidth = 800;
  const imageHeight = (imageWidth * asset.height) / asset.width;
  // Keep native image dimensions fixed; only its transform changes on the UI thread.
  const photoStyle = useAnimatedStyle(() => {
    const photo = tripPhotoGeometry(
      { pageX: fromX, width: fromWidth, height: fromHeight },
      { pageX: toX, width: toWidth, height: toHeight },
      imageWidth,
      imageHeight,
      amount.value
    );
    return {
      transform: [
        { translateX: photo.x },
        { translateY: photo.y },
        { scale: photo.scale },
      ],
    };
  });
  const headingStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          20 + 12 * amount.value + tripContentOffset(fromX, toX, amount.value),
      },
      { translateY: 24 + (topInset + 70 - 24) * amount.value },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(amount.value, [0.8, 1], [0, 1], 'clamp'),
  }));
  const activitiesStyle = useAnimatedStyle(() => ({
    top: Math.max(topInset + 210, frame.value.height * 0.39),
    width: frame.value.width,
    opacity: interpolate(
      amount.value,
      backward ? [0.06, 0.2] : [0.35, 0.55],
      [0, 1],
      'clamp'
    ),
  }));
  const footerStyle = useAnimatedStyle(() => ({
    top: frame.value.height - bottomInset - 40,
    opacity: interpolate(amount.value, [0.7, 1], [0, 1], 'clamp'),
  }));
  const pickupMetadata = expanded.metadata as TripPickupMetadata | undefined;
  const expandedAndIdle = settled === 'expanded' && !transitioning;

  return (
    <Animated.View
      style={[
        styles.frame,
        {
          width: expandedAndIdle ? toWidth : fromWidth,
          height: expandedAndIdle ? toHeight : fromHeight,
        },
        frameStyle,
      ]}
    >
      <Animated.Image
        source={trip.image}
        resizeMode="cover"
        fadeDuration={0}
        style={[
          styles.photo,
          { width: imageWidth, height: imageHeight },
          photoStyle,
        ]}
      />
      <View pointerEvents="none" style={styles.scrim} />
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.back, { top: topInset + 8 }, backStyle]}
      >
        <AppIcon name="back" color="#FFFFFF" />
      </Animated.View>
      <Animated.View style={[styles.heading, headingStyle]}>
        <Text style={styles.title}>{trip.title}</Text>
        <Text style={styles.dates}>{trip.dates}</Text>
      </Animated.View>
      <Animated.View
        onLayout={(event) => {
          if (pickupMetadata)
            pickupMetadata.activityHeight.value =
              event.nativeEvent.layout.height;
        }}
        style={[styles.activities, { width: toWidth }, activitiesStyle]}
        pointerEvents={expandedAndIdle ? 'auto' : 'none'}
        accessibilityElementsHidden={!expandedAndIdle}
        importantForAccessibility={
          expandedAndIdle ? 'auto' : 'no-hide-descendants'
        }
      >
        <Text style={styles.sectionTitle}>ACTIVITIES</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}
        >
          {trip.days.map((day, index) => (
            <ActivityCard
              key={day.date}
              day={day}
              activity={trip.activity}
              index={index}
              progress={amount}
              reduceMotion={reduceMotion}
              backward={backward}
            />
          ))}
        </ScrollView>
      </Animated.View>
      <Animated.Text
        style={[styles.destination, footerStyle]}
        accessibilityElementsHidden={!expandedAndIdle}
      >
        DESTINATION / {trip.title.replace('\n', ', ')}
      </Animated.Text>
    </Animated.View>
  );
}

function ActivityCard({
  day,
  activity,
  index,
  progress,
  reduceMotion,
  backward,
}: {
  day: Trip['days'][number];
  activity: string;
  index: number;
  progress: SharedValue<number>;
  reduceMotion: boolean;
  backward: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const t = tripActivityProgress(progress.value, index, backward);
    return {
      opacity: t,
      transform: [
        { perspective: 700 },
        { translateX: reduceMotion ? 0 : (1 - t) * (60 + index * 25) },
        { translateY: reduceMotion ? 0 : (1 - t) * 48 },
        { rotateY: `${reduceMotion ? 0 : (1 - t) * -65}deg` },
        { rotateZ: `${reduceMotion ? 0 : (1 - t) * (index % 2 ? 9 : -9)}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.activityCard, style]}>
      <Text style={styles.day}>DAY {index + 1}</Text>
      <Text style={styles.date}>{day.date}</Text>
      <Text style={styles.activity}>{activity}</Text>
      <Image
        source={day.map}
        style={styles.map}
        resizeMode="cover"
        fadeDuration={0}
        accessibilityLabel={`Illustrated ${activity.toLowerCase()} route for ${day.date}`}
      />
      <View style={styles.stats}>
        <Text style={styles.stat}>{day.hours}</Text>
        <Text style={styles.stat}>{day.distance}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: theme.surface,
  },
  photo: { position: 'absolute', top: 0, left: 0, transformOrigin: 'top left' },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#10262425',
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.35) 100%)',
  },
  back: {
    position: 'absolute',
    left: 20,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { position: 'absolute', top: 0, left: 0, width: 290 },
  title: {
    fontFamily: theme.font,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: 0.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dates: {
    fontFamily: theme.font,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 9,
  },
  activities: { position: 'absolute', left: 0 },
  sectionTitle: {
    fontFamily: theme.font,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginLeft: 32,
    marginBottom: 14,
  },
  cards: { paddingHorizontal: 32, paddingBottom: 12, gap: 16 },
  activityCard: {
    width: ACTIVITY_CARD_WIDTH,
    padding: ACTIVITY_CARD_PADDING,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    boxShadow: '0px 4px 12px rgba(0,0,0,0.16)',
  },
  day: {
    fontFamily: theme.font,
    fontSize: 10,
    fontWeight: '700',
    color: theme.trips.accent,
  },
  date: {
    fontFamily: theme.font,
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
    marginTop: 2,
  },
  activity: {
    fontFamily: theme.font,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 28,
    marginBottom: 8,
    color: theme.text,
  },
  map: {
    // Explicit dimensions override the bundled image's intrinsic 456×300 size.
    width: MAP_WIDTH,
    height: (MAP_WIDTH * 300) / 456,
    backgroundColor: '#253D42',
    borderRadius: 6,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  stat: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 10,
    fontWeight: '700',
  },
  destination: {
    position: 'absolute',
    left: 32,
    color: '#FFFFFF',
    fontFamily: theme.font,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});

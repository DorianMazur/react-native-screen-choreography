import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { AppIcon, ScreenHeader } from '../AppChrome';
import {
  SafeAreaView,
  useChoreographyControls,
  useExampleNavigation,
  useSafeAreaInsets,
  useSharedElementPresentation,
} from '../runtime';
import { theme } from '../theme';
import { usePullToDismiss } from '../usePullToDismiss';
import {
  daylightFrame,
  daylightGroup,
  daylightOpacities,
  photoCorner,
} from './daylightGeometry';
import { daylightTransition } from './daylightTransition';
import {
  clockTime,
  dayLength,
  EVENTS,
  PLACES,
  type Place,
  type SunEvent,
} from './places';
import { SunChart } from './SunChart';

const THUMB_SIZE = 64;

export function DaylightScreen() {
  const { goBack, navigate } = useExampleNavigation();
  return (
    <SafeAreaView style={styles.home}>
      <StatusBar barStyle="light-content" />
      <ScreenHeader title="Daylight" onBack={() => goBack()} />
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            Saved places
          </Text>
          <Text style={styles.meta}>June 21</Text>
        </View>
        {PLACES.map((place, index) => {
          const featured = index === 0;
          const group = daylightGroup(place.id);
          return (
            <Pressable
              key={place.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${place.name}, ${dayLength(place)} of daylight`}
              onPress={() =>
                navigate(
                  {
                    screen: 'JournalDetail',
                    params: { collectionId: place.id },
                  },
                  {
                    ...daylightTransition.navigationOptions,
                    transitionConfig: { group },
                  }
                )
              }
              style={({ pressed }) => [
                featured ? styles.featured : styles.row,
                pressed && styles.pressed,
              ]}
            >
              <daylightTransition.Element
                name="photo"
                groupId={group}
                style={featured ? styles.widePhoto : styles.smallPhoto}
              >
                <View
                  collapsable={false}
                  style={[
                    styles.photo,
                    {
                      borderRadius: featured
                        ? theme.radius.lg
                        : photoCorner(THUMB_SIZE),
                    },
                  ]}
                >
                  <Image
                    accessible={false}
                    source={place.image}
                    resizeMode="cover"
                    style={styles.image}
                  />
                  {featured && (
                    <>
                      <View style={styles.shade} />
                      <View style={styles.caption}>
                        <Text style={styles.heroName}>{place.name}</Text>
                        <Text style={styles.heroRegion}>{place.region}</Text>
                        <View style={styles.duration}>
                          <AppIcon
                            name="sun"
                            size={15}
                            color={theme.trips.accent}
                          />
                          <Text style={styles.heroDay}>
                            {dayLength(place)} of daylight
                          </Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              </daylightTransition.Element>
              {!featured && (
                <>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName}>{place.name}</Text>
                    <Text style={styles.region}>{place.region}</Text>
                  </View>
                  <Text style={styles.smallDuration}>{dayLength(place)}</Text>
                  <AppIcon name="arrow" size={16} color={theme.textSecondary} />
                </>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

export function DaylightDetailScreen({
  collectionId,
}: {
  collectionId?: string;
}) {
  const place = PLACES.find((item) => item.id === collectionId) ?? PLACES[0];
  const groupId = daylightGroup(place.id);
  const { goBack } = useExampleNavigation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [viewport, setViewport] = useState({
    width: window.width,
    height: window.height,
  });
  const panHandlers = usePullToDismiss(groupId);
  const close = () => goBack(daylightTransition.navigationOptions);
  return (
    <View
      style={styles.fill}
      onLayout={({ nativeEvent: { layout } }) =>
        setViewport((current) =>
          current.width === layout.width && current.height === layout.height
            ? current
            : { width: layout.width, height: layout.height }
        )
      }
    >
      <StatusBar barStyle="light-content" />
      <daylightTransition.Element.Target
        name="photo"
        groupId={groupId}
        style={StyleSheet.absoluteFill}
        hostStyle={styles.hiddenHost}
      >
        <SunGuide place={place} viewport={viewport} />
      </daylightTransition.Element.Target>
      <View
        {...panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Pull down to close sun guide"
        accessibilityHint="Release a short pull to keep the guide open."
        onAccessibilityTap={close}
        testID="daylight-dismiss-handle"
        style={[styles.grabArea, { top: insets.top }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close sun guide"
        onPress={close}
        testID="daylight-close"
        style={[styles.backArea, { top: insets.top + theme.spacing.sm }]}
      />
    </View>
  );
}

function SunGuide({
  place,
  viewport,
}: {
  place: Place;
  viewport: { width: number; height: number };
}) {
  const { collapsed, expanded, presentationProgress, frame } =
    useSharedElementPresentation();
  const { settleTransition } = useChoreographyControls();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<SunEvent>(EVENTS[2]);
  const collapsedMetrics = collapsed.metrics;
  const expandedMetrics = expanded.metrics;
  const cardStyle = useAnimatedStyle(() => {
    if (!frame.value || !collapsedMetrics || !expandedMetrics) {
      return {
        opacity: 1,
        ...viewport,
        borderRadius: 0,
        transform: [{ translateX: 0 }, { translateY: 0 }],
      };
    }
    const mask = daylightFrame(
      collapsedMetrics,
      expandedMetrics,
      presentationProgress.value
    );
    return {
      opacity: daylightOpacities(presentationProgress.value).card,
      width: mask.width,
      height: mask.height,
      borderRadius: mask.radius,
      transform: [
        { translateX: mask.x - expandedMetrics.pageX },
        { translateY: mask.y - expandedMetrics.pageY },
      ],
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const mask =
      frame.value && collapsedMetrics && expandedMetrics
        ? daylightFrame(
            collapsedMetrics,
            expandedMetrics,
            presentationProgress.value
          )
        : viewport;
    const scale = mask.width / viewport.width;
    return {
      transform: [
        { translateY: (mask.height - viewport.height * scale) / 2 },
        { scale },
      ],
    };
  });
  return (
    <Animated.View style={[styles.card, cardStyle]}>
      <Animated.View style={[styles.content, viewport, contentStyle]}>
        {/* The route owns the hit areas while the header moves during a pull. */}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ marginTop: insets.top }}
        >
          <ScreenHeader title="Daylight" />
          <View style={styles.handleTrack}>
            <View style={styles.handle} />
          </View>
        </View>
        <ScrollView
          onScrollBeginDrag={settleTransition}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.page,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.xl) },
          ]}
        >
          <View style={styles.detailHeading}>
            <Text accessibilityRole="header" style={styles.title}>
              {place.name}
            </Text>
            <Text style={styles.meta}>{place.region} · June 21</Text>
          </View>
          <SunChart place={place} event={event} />
          <View style={styles.scheduleHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Sun schedule
            </Text>
            <Text style={styles.meta}>{place.zone}</Text>
          </View>
          <View accessibilityRole="radiogroup">
            {EVENTS.map((option) => {
              const selected = option.key === event.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.title}, ${clockTime(place[option.key])}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    settleTransition();
                    setEvent(option);
                  }}
                  style={({ pressed }) => [
                    styles.eventRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppIcon
                    name={option.icon}
                    size={20}
                    color={selected ? theme.trips.accent : theme.textSecondary}
                  />
                  <Text
                    style={[styles.eventLabel, selected && styles.selected]}
                  >
                    {option.title}
                  </Text>
                  <Text style={[styles.eventTime, selected && styles.selected]}>
                    {clockTime(place[option.key])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  home: { flex: 1, backgroundColor: theme.bg },
  page: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  title: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 32,
    fontWeight: '600',
    letterSpacing: -1,
  },
  meta: { fontFamily: theme.font, color: theme.textSecondary, fontSize: 14 },
  featured: { marginBottom: theme.spacing.sm },
  widePhoto: { width: '100%', aspectRatio: 1.52 },
  smallPhoto: { width: THUMB_SIZE, height: THUMB_SIZE },
  photo: { flex: 1, overflow: 'hidden', backgroundColor: theme.surface },
  image: { width: '100%', height: '100%' },
  shade: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage:
      'linear-gradient(180deg, rgba(9,13,12,0) 20%, rgba(9,13,12,0.33) 49%, rgba(9,13,12,0.94) 100%)',
  },
  caption: { position: 'absolute', left: 20, right: 20, bottom: 18 },
  heroName: {
    color: theme.text,
    fontFamily: theme.font,
    fontWeight: '600',
    fontSize: 27,
    letterSpacing: -0.8,
  },
  heroRegion: {
    color: '#E2E6E0',
    fontFamily: theme.font,
    fontSize: 13,
    marginTop: 1,
  },
  duration: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
  },
  heroDay: { fontFamily: theme.font, fontSize: 13, color: theme.trips.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  rowBody: { flex: 1, gap: 3 },
  rowName: {
    fontFamily: theme.font,
    color: theme.text,
    fontSize: 17,
    fontWeight: '600',
  },
  region: { fontFamily: theme.font, color: theme.textSecondary, fontSize: 13 },
  smallDuration: {
    fontFamily: theme.numbers,
    color: theme.textSecondary,
    fontSize: 11,
  },
  pressed: { opacity: 0.7 },
  hiddenHost: { opacity: 0, pointerEvents: 'none' },
  card: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    backgroundColor: theme.bg,
  },
  content: {
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'top left',
  },
  handleTrack: {
    position: 'absolute',
    top: theme.spacing.xs,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.textMuted,
  },
  grabArea: {
    position: 'absolute',
    alignSelf: 'center',
    width: 112,
    height: 40,
  },
  backArea: { position: 'absolute', left: 14, width: 44, height: 44 },
  detailHeading: {
    gap: 4,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  scheduleHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    fontFamily: theme.font,
    fontSize: 20,
    color: theme.text,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 54,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  eventLabel: {
    flex: 1,
    fontFamily: theme.font,
    fontSize: 16,
    color: theme.text,
  },
  eventTime: {
    fontFamily: theme.numbers,
    fontSize: 13,
    color: theme.textSecondary,
  },
  selected: { color: theme.trips.accent },
});

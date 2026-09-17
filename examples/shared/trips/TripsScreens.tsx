import { useState } from 'react';
import Animated from 'react-native-reanimated';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppIcon, ScreenHeader } from '../AppChrome';
import {
  SafeAreaView,
  useChoreographyControls,
  useExampleNavigation,
  useSafeAreaInsets,
} from '../runtime';
import { theme } from '../theme';
import { TRIPS } from './data';
import { TripHero } from './TripHero';
import { useTripPickup } from './useTripPickup';
import { tripsTransition } from './tripsTransitions';

export function TripsListScreen() {
  const { goBack, navigate } = useExampleNavigation();
  const { settleTransition } = useChoreographyControls();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(0);
  const cardWidth = Math.min(width - 76, 360);
  const cardHeight = Math.max(320, Math.min(490, height * 0.53));
  const selectedTrip = TRIPS[selected] ?? TRIPS[0]!;

  return (
    <SafeAreaView style={styles.list}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        onTouchStart={settleTransition}
        onScrollBeginDrag={settleTransition}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      >
        <tripsTransition.Exit name="chrome">
          <ScreenHeader title="Trips" onBack={() => goBack()} />
          <View style={styles.intro}>
            <Text accessibilityRole="header" style={styles.label}>
              Next adventures
            </Text>
            <View style={styles.summary}>
              <Text style={styles.subtitle}>Places to look forward to</Text>
              <Text style={styles.count}>{TRIPS.length} PLANNED</Text>
            </View>
          </View>
        </tripsTransition.Exit>
        <ScrollView
          horizontal
          onScrollBeginDrag={settleTransition}
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={cardWidth + 16}
          contentContainerStyle={styles.carousel}
          onMomentumScrollEnd={(event) =>
            setSelected(
              Math.min(
                TRIPS.length - 1,
                Math.max(
                  0,
                  Math.round(
                    event.nativeEvent.contentOffset.x / (cardWidth + 16)
                  )
                )
              )
            )
          }
        >
          {TRIPS.map((trip) => (
            <View
              key={trip.id}
              style={{ width: cardWidth, height: cardHeight }}
            >
              <tripsTransition.Element
                name="trip"
                groupId={`trip.${trip.id}`}
                style={styles.card}
              >
                <TripHero
                  trip={trip}
                  width={cardWidth}
                  height={cardHeight}
                  topInset={insets.top}
                  bottomInset={insets.bottom}
                />
              </tripsTransition.Element>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${trip.title.replace('\n', ' ')} trip`}
                onPress={() =>
                  navigate(
                    { screen: 'TripsDetail', params: { tripId: trip.id } },
                    {
                      ...tripsTransition.navigationOptions,
                      transitionConfig: { group: `trip.${trip.id}` },
                    }
                  )
                }
                style={StyleSheet.absoluteFill}
              />
            </View>
          ))}
        </ScrollView>
        <tripsTransition.Exit name="chrome">
          <View style={styles.flight}>
            <View style={styles.flightIcon}>
              <AppIcon name="external" color={theme.trips.accent} size={22} />
            </View>
            <View style={styles.flightInfo}>
              <Text style={styles.departure}>DEPARTURE</Text>
              <Text style={styles.airport}>{selectedTrip.airport}</Text>
              <Text style={styles.flightDate}>
                {selectedTrip.dates} · 12:30 PM
              </Text>
            </View>
          </View>
        </tripsTransition.Exit>
      </ScrollView>
    </SafeAreaView>
  );
}

export function TripsDetailScreen({ tripId = 'seiland' }: { tripId?: string }) {
  const trip = TRIPS.find((item) => item.id === tripId) ?? TRIPS[0]!;
  const { goBack } = useExampleNavigation();
  const insets = useSafeAreaInsets();
  const pickup = useTripPickup(insets.top);
  return (
    <View style={[styles.detail, pickup.pickedUp && styles.pickedUp]}>
      <StatusBar barStyle="light-content" />
      <tripsTransition.Element.Target
        metadata={pickup.metadata}
        name="trip"
        groupId={`trip.${trip.id}`}
        style={StyleSheet.absoluteFill}
      />
      {/* Keep the responder on this screen: the retained photo's React ancestry
          still belongs to the list, even when its native view is here. */}
      <View
        {...pickup.panHandlers}
        testID="trip-pickup-photo"
        style={[styles.pickupSurface, pickup.upperPhotoStyle]}
      />
      <Animated.View
        {...pickup.panHandlers}
        style={[
          styles.pickupSurface,
          styles.lowerPhoto,
          pickup.lowerPhotoStyle,
        ]}
      />
      {/* The visible arrow lives in TripHero so the native overlay cannot cover
          its fade. This transparent target stays on the destination screen. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to trips"
        disabled={pickup.pickedUp}
        onPress={() => goBack(tripsTransition.navigationOptions)}
        style={[styles.detailBack, { top: insets.top + 8 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: theme.bg },
  listContent: { paddingBottom: 32 },
  intro: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  label: {
    fontFamily: theme.font,
    fontSize: 30,
    fontWeight: '600',
    color: theme.text,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  subtitle: {
    fontFamily: theme.font,
    fontSize: 12,
    color: theme.textSecondary,
  },
  count: { fontFamily: theme.numbers, fontSize: 10, color: theme.trips.accent },
  carousel: { paddingHorizontal: 24, gap: 16 },
  card: { flex: 1, borderRadius: theme.radius.lg },
  flight: {
    marginHorizontal: 24,
    marginTop: 24,
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flightIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.trips.glow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flightInfo: { flex: 1, gap: 3 },
  departure: {
    color: theme.trips.accent,
    fontFamily: theme.font,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
  },
  airport: {
    color: theme.text,
    fontFamily: theme.font,
    fontSize: 12,
    fontWeight: '600',
  },
  flightDate: {
    color: theme.textSecondary,
    fontFamily: theme.font,
    fontSize: 10,
  },
  detail: { flex: 1, backgroundColor: theme.bg },
  pickedUp: { backgroundColor: 'transparent' },
  pickupSurface: { position: 'absolute', left: 0, right: 0 },
  lowerPhoto: { bottom: 0 },
  detailBack: {
    position: 'absolute',
    left: 20,
    width: 44,
    height: 44,
  },
});

import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../AppChrome';
import { theme } from '../theme';
import { clockTime, type Place, type SunEvent } from './places';

const COLUMNS = 57;
const PATH = Array.from({ length: COLUMNS }, (_, i) => i / (COLUMNS - 1));
const HEIGHT = 100;
const rise = (fraction: number) => Math.sin(Math.PI * fraction) * HEIGHT;

export function SunChart({ place, event }: { place: Place; event: SunEvent }) {
  const fraction =
    (place[event.key] - place.sunrise) / (place.sunset - place.sunrise);
  const [time, period] = clockTime(place[event.key]).split(' ');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${place.name}, ${event.title} at ${time} ${period} ${place.zone}`}
      style={styles.card}
    >
      <View style={styles.chartHeading}>
        <Text style={styles.event}>{event.title}</Text>
        <AppIcon name={event.icon} size={24} color={theme.trips.accent} />
      </View>
      <Text style={styles.time}>
        {time}
        <Text style={styles.period}> {period}</Text>
      </Text>
      <View style={styles.plot}>
        <View style={styles.horizon} />
        {PATH.map((position) => (
          <View
            key={position}
            style={[
              styles.stem,
              position <= fraction && styles.litStem,
              {
                left: `${position * 100}%`,
                height: 2 + rise(position),
              },
            ]}
          >
            <View style={[styles.tip, position <= fraction && styles.litTip]} />
          </View>
        ))}
        <View
          style={[
            styles.sun,
            { left: `${fraction * 100}%`, bottom: rise(fraction) - 9 },
          ]}
        />
      </View>
      <View style={styles.axis}>
        <Text style={styles.tick}>{clockTime(place.sunrise)}</Text>
        <Text style={styles.tick}>{clockTime(place.sunset)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
  },
  chartHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  event: {
    fontFamily: theme.font,
    fontSize: 15,
    fontWeight: '600',
    color: theme.trips.accent,
  },
  time: {
    fontFamily: theme.font,
    fontWeight: '600',
    fontSize: 48,
    letterSpacing: -2,
    color: theme.text,
    fontVariant: ['tabular-nums'],
  },
  period: { fontSize: 18, letterSpacing: 0, color: theme.textSecondary },
  plot: { height: HEIGHT + 24, marginHorizontal: 9, marginTop: 8 },
  horizon: {
    position: 'absolute',
    bottom: 0,
    left: -8,
    right: -8,
    height: 1,
    backgroundColor: theme.borderStrong,
  },
  stem: {
    position: 'absolute',
    bottom: 0,
    width: 1,
    alignItems: 'center',
    backgroundColor: theme.borderStrong,
  },
  litStem: { backgroundColor: '#745F3C' },
  tip: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.textMuted,
  },
  litTip: { backgroundColor: theme.trips.accent },
  sun: {
    position: 'absolute',
    marginLeft: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: theme.surface,
    backgroundColor: theme.trips.accent,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  tick: { fontFamily: theme.numbers, fontSize: 10, color: theme.textSecondary },
});

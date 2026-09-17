import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { formatMoney, walletTheme as theme } from './walletTheme';
import type { Token } from './data';

const samples = {
  '1D': [
    14, 18, 16, 22, 20, 15, 19, 26, 21, 25, 30, 24, 27, 32, 29, 36, 34, 38, 32,
    40, 35, 42, 40, 44,
  ],
  '1W': [
    10, 16, 24, 18, 28, 32, 25, 18, 21, 14, 19, 30, 38, 42, 35, 31, 24, 30, 37,
    42, 39, 46, 42, 44,
  ],
  '1M': [
    8, 10, 18, 12, 22, 16, 12, 10, 18, 24, 32, 38, 42, 36, 29, 21, 26, 32, 25,
    38, 46, 39, 48, 44,
  ],
};
const periods = ['1D', '1W', '1M'] as const;
const startLabels = {
  '1D': '24 hours ago',
  '1W': '7 days ago',
  '1M': '30 days ago',
};

export function PriceHistory({
  token,
  expansion,
  onInteract,
}: {
  token: Token;
  expansion: SharedValue<number>;
  onInteract: () => void;
}) {
  const [period, setPeriod] = useState<(typeof periods)[number]>('1D');
  const reduceMotion = useReducedMotion();
  const chartStyle = useAnimatedStyle(() => {
    const reveal = interpolate(expansion.value, [0.42, 0.76], [0, 1], 'clamp');
    return {
      opacity: reveal,
      transform: [
        { scaleY: reduceMotion ? 1 : reveal * reveal * (3 - 2 * reveal) },
      ],
    };
  });
  const values = samples[period];
  const extent = period === '1D' ? 0.04 : period === '1W' ? 0.12 : 0.24;
  const direction = token.change24h >= 0 ? 1 : -1;
  const prices = values.map(
    (value) => token.price * (1 + ((value - 44) / 44) * extent * direction)
  );
  const low = Math.min(...prices);
  const high = Math.max(...prices);

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.label}>SAMPLE PRICE HISTORY</Text>
        <Text style={styles.label}>USD</Text>
      </View>
      <View
        style={styles.chart}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${period} sample price history. Low ${formatMoney(low)}, high ${formatMoney(high)}.`}
      >
        {[0, 0.5, 1].map((position) => (
          <View
            key={position}
            style={[styles.gridline, { top: `${position * 100}%` }]}
          />
        ))}
        <Animated.View style={[styles.bars, chartStyle]}>
          {prices.map((price, index) => (
            <View key={index} style={styles.track}>
              <View
                style={[
                  styles.bar,
                  {
                    height: `${20 + ((price - low) / (high - low || 1)) * 76}%`,
                    backgroundColor:
                      direction > 0 ? theme.accent : theme.negative,
                    opacity: 0.45 + (index / (prices.length - 1)) * 0.55,
                  },
                ]}
              />
            </View>
          ))}
        </Animated.View>
      </View>
      <View style={styles.axis}>
        <Text style={styles.label}>{startLabels[period]}</Text>
        <Text style={styles.label}>Now</Text>
      </View>
      <View style={styles.periods} accessibilityRole="tablist">
        {periods.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityLabel={`${option} price history`}
            accessibilityState={{ selected: period === option }}
            onPress={() => {
              onInteract();
              setPeriod(option);
            }}
            style={[styles.period, period === option && styles.selected]}
          >
            <Text
              style={[
                styles.periodText,
                period === option && styles.selectedText,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.range}>
        <Text style={styles.rangeText}>
          Low <Text style={styles.number}>{formatMoney(low)}</Text>
        </Text>
        <Text style={styles.rangeText}>
          High <Text style={styles.number}>{formatMoney(high)}</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  label: { fontFamily: theme.font, fontSize: 10, color: theme.secondary },
  chart: { height: 138 },
  bars: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'flex-end',
    transformOrigin: 'bottom',
  },
  gridline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.border,
  },
  track: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  axis: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  periods: { flexDirection: 'row', alignSelf: 'center', gap: 8, marginTop: 20 },
  period: {
    width: 64,
    height: 44,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selected: { backgroundColor: theme.accent },
  periodText: {
    fontFamily: theme.numbers,
    fontSize: 12,
    color: theme.secondary,
  },
  selectedText: { color: theme.ink },
  range: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 20,
  },
  rangeText: { fontFamily: theme.font, fontSize: 12, color: theme.secondary },
  number: { fontFamily: theme.numbers, color: theme.text },
});

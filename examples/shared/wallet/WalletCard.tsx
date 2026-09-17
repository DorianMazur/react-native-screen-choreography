import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSharedElementPresentation } from '../runtime';
import { AppIcon } from '../AppChrome';
import { TOKENS, type Token } from './data';
import { formatMoney, walletTheme as theme } from './walletTheme';
import { TokenLogo } from './TokenLogo';
import { WalletIconButton } from './WalletIcon';
import { PriceHistory } from './PriceHistory';

export interface WalletCardActions {
  openWebsite: () => void;
  settleTransition: () => void;
}

const portfolioValue = TOKENS.reduce((sum, token) => sum + token.value, 0);
const mix = (from: number, to: number, progress: number) => {
  'worklet';
  return from + (to - from) * progress;
};

export function WalletCard({
  token,
  width,
  height,
  topInset,
  bottomInset,
}: {
  token: Token;
  width: number;
  height: number;
  topInset: number;
  bottomInset: number;
}) {
  const {
    presentationProgress: amount,
    transitioning,
    settled,
    collapsed,
    expanded,
  } = useSharedElementPresentation();
  const fromWidth = collapsed.metrics?.width ?? width;
  const fromHeight = collapsed.metrics?.height ?? 92;
  const toWidth = expanded.metrics?.width ?? width + 32;
  const toHeight = expanded.metrics?.height ?? height;
  const expandedAndIdle = settled === 'expanded' && !transitioning;
  const actions = expanded.metadata as WalletCardActions | undefined;
  const headerTop = topInset + 112;
  const bodyTop = headerTop + 180;
  const valueWidth = useSharedValue(100);
  const changeWidth = useSharedValue(60);
  const allocation = (token.value / portfolioValue) * 100;
  const isPositive = token.change24h >= 0;
  const frameStyle = useAnimatedStyle(() => ({
    width: mix(fromWidth, toWidth, amount.value),
    height: mix(fromHeight, toHeight, amount.value),
    borderRadius: 16 * (1 - amount.value),
    backgroundColor: interpolateColor(
      amount.value,
      [0, 1],
      [theme.surface, theme.background]
    ),
  }));
  const handleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: 14 + topInset * amount.value },
      { translateX: (mix(fromWidth, toWidth, amount.value) - 36) / 2 },
    ],
    opacity: interpolate(amount.value, [0.15, 0.45], [0, 1], 'clamp'),
  }));
  const toolbarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (topInset + 32) * amount.value }],
    opacity: interpolate(amount.value, [0.65, 1], [0, 1], 'clamp'),
  }));
  const valueStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: mix(fromWidth - 16 - valueWidth.value, 24, amount.value) },
      { translateY: mix(24, headerTop + 80, amount.value) },
      { scale: mix(1, 36 / 15, amount.value) },
    ],
  }));
  const changeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: mix(fromWidth - 16 - changeWidth.value, 24, amount.value) },
      { translateY: mix(50, headerTop + 142, amount.value) },
    ],
  }));
  // Clip the fixed-size detail with the outer frame instead of relaying out
  // its chart, text, and ScrollView on every gesture update.
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: mix(fromHeight, bodyTop, amount.value) }],
    opacity: interpolate(amount.value, [0.35, 0.9], [0, 1], 'clamp'),
  }));

  return (
    <Animated.View style={[styles.frame, frameStyle]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.handle, handleStyle]}
      />
      <Animated.View
        pointerEvents={expandedAndIdle ? 'auto' : 'none'}
        accessibilityElementsHidden={!expandedAndIdle}
        importantForAccessibility={
          expandedAndIdle ? 'auto' : 'no-hide-descendants'
        }
        style={[styles.toolbar, { width: toWidth }, toolbarStyle]}
      >
        <View pointerEvents="none" style={styles.backIcon}>
          <AppIcon name="back" />
        </View>
        <Text style={styles.toolbarTitle}>Asset overview</Text>
        <WalletIconButton
          icon="external"
          label={`Open ${token.name} website`}
          onPress={() => actions?.openWebsite()}
        />
      </Animated.View>
      <CardItem
        amount={amount}
        from={[16, 24]}
        to={[24, headerTop]}
        scale={48 / 44}
      >
        <TokenLogo token={token} size={44} />
      </CardItem>
      <CardItem
        amount={amount}
        from={[72, 22]}
        to={[86, headerTop]}
        scale={22 / 16}
      >
        <Text numberOfLines={1} style={styles.name}>
          {token.name}
        </Text>
      </CardItem>
      <CardItem amount={amount} from={[72, 50]} to={[86, headerTop + 34]}>
        <Text style={styles.symbol}>{token.symbol}</Text>
      </CardItem>
      <Animated.View style={[styles.item, valueStyle]}>
        <Text
          onLayout={(event) => {
            valueWidth.value = event.nativeEvent.layout.width;
          }}
          style={styles.value}
        >
          {formatMoney(token.price)}
        </Text>
      </Animated.View>
      <Animated.View style={[styles.item, changeStyle]}>
        <Text
          onLayout={(event) => {
            changeWidth.value = event.nativeEvent.layout.width;
          }}
          style={[
            styles.change,
            { color: isPositive ? theme.positive : theme.negative },
          ]}
        >
          {isPositive ? '+' : ''}
          {token.change24h.toFixed(2)}%
        </Text>
      </Animated.View>
      {(transitioning || settled === 'expanded') && (
        <Animated.View
          style={[
            styles.body,
            {
              width: toWidth,
              height: Math.max(0, toHeight - bodyTop - bottomInset),
            },
            bodyStyle,
          ]}
          pointerEvents={expandedAndIdle ? 'auto' : 'none'}
          accessibilityElementsHidden={!expandedAndIdle}
          importantForAccessibility={
            expandedAndIdle ? 'auto' : 'no-hide-descendants'
          }
        >
          <ScrollView
            scrollEnabled={expandedAndIdle}
            onScrollBeginDrag={() => actions?.settleTransition()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <PriceHistory
              token={token}
              expansion={amount}
              onInteract={() => actions?.settleTransition()}
            />
            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Your position
                </Text>
                <Text style={styles.demoLabel}>DEMO</Text>
              </View>
              <Text style={styles.balanceValue}>
                {formatMoney(token.value)}
              </Text>
              <Text style={styles.balanceAmount}>
                {token.balance.toLocaleString('en-US', {
                  maximumFractionDigits: 6,
                })}{' '}
                {token.symbol}
              </Text>
              <View style={styles.positionTrack}>
                <View
                  style={[
                    styles.positionFill,
                    { width: `${allocation}%`, backgroundColor: token.color },
                  ]}
                />
              </View>
              <View style={styles.positionCaption}>
                <Text style={styles.secondary}>Portfolio weight</Text>
                <Text style={styles.positionPercent}>
                  {allocation.toFixed(1)}%
                </Text>
              </View>
            </View>
            <View style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                About {token.name}
              </Text>
              <Text style={styles.description}>{token.description}</Text>
            </View>
          </ScrollView>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function CardItem({
  amount,
  from,
  to,
  scale = 1,
  children,
}: {
  amount: SharedValue<number>;
  from: readonly [number, number];
  to: readonly [number, number];
  scale?: number;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: mix(from[0], to[0], amount.value) },
      { translateY: mix(from[1], to[1], amount.value) },
      { scale: mix(1, scale, amount.value) },
    ],
  }));
  return <Animated.View style={[styles.item, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  item: { position: 'absolute', top: 0, left: 0, transformOrigin: 'top left' },
  handle: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.secondary,
  },
  toolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  toolbarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.font,
    fontSize: 14,
    color: theme.secondary,
  },
  backIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: theme.font,
    fontSize: 16,
    lineHeight: 22.4,
    fontWeight: '600',
    color: theme.text,
  },
  symbol: {
    fontFamily: theme.font,
    fontSize: 13,
    lineHeight: 18,
    color: theme.secondary,
  },
  value: {
    fontFamily: theme.numbers,
    fontSize: 15,
    lineHeight: 21,
    color: theme.text,
  },
  change: { fontFamily: theme.numbers, fontSize: 13, lineHeight: 18 },
  body: { position: 'absolute', top: 0, left: 0 },
  scrollContent: { paddingBottom: 24 },
  section: { padding: 24, borderTopWidth: 1, borderTopColor: theme.border },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: theme.font,
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
  },
  demoLabel: {
    fontFamily: theme.numbers,
    fontSize: 10,
    color: theme.secondary,
  },
  balanceValue: {
    fontFamily: theme.numbers,
    fontSize: 26,
    color: theme.text,
    marginTop: 18,
  },
  balanceAmount: {
    fontFamily: theme.numbers,
    fontSize: 13,
    color: theme.secondary,
    marginTop: 6,
  },
  positionTrack: {
    height: 4,
    backgroundColor: theme.border,
    borderRadius: 2,
    marginTop: 22,
    overflow: 'hidden',
  },
  positionFill: { height: '100%' },
  positionCaption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  secondary: { fontFamily: theme.font, fontSize: 12, color: theme.secondary },
  positionPercent: {
    fontFamily: theme.numbers,
    fontSize: 12,
    color: theme.text,
  },
  description: {
    fontFamily: theme.font,
    fontSize: 14,
    lineHeight: 23,
    color: theme.secondary,
    marginTop: 12,
  },
});

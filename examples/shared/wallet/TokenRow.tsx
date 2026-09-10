import { TokenSharedContent } from './TokenSharedContent';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SharedElement } from '../runtime';
import type { Token } from './data';
import { formatMoney, walletTheme as theme } from './walletTheme';
import { TokenLogo } from './TokenLogo';
import {
  tokenIconTransition,
  tokenTextTransition,
  tokenValueTransition,
} from './walletTransitions';

interface TokenRowProps {
  token: Token;
  onPress: () => void;
}

export function TokenRow({ token, onPress }: TokenRowProps) {
  const isPositiveChange = token.change24h >= 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${token.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <View style={styles.rowContainer}>
        <View style={styles.row}>
          <SharedElement
            id={`token.${token.id}.icon`}
            groupId={`token.${token.id}`}
            transition={tokenIconTransition}
            portalStyle={styles.portal}
          >
            <TokenSharedContent>
              <TokenLogo token={token} size={44} />
            </TokenSharedContent>
          </SharedElement>

          <View style={styles.info}>
            <SharedElement
              id={`token.${token.id}.name`}
              groupId={`token.${token.id}`}
              transition={tokenTextTransition}
              portalStyle={styles.portal}
            >
              <TokenSharedContent>
                <Text style={styles.name}>{token.name}</Text>
              </TokenSharedContent>
            </SharedElement>

            <SharedElement
              id={`token.${token.id}.symbol`}
              groupId={`token.${token.id}`}
              transition={tokenTextTransition}
              portalStyle={styles.portal}
            >
              <TokenSharedContent>
                <Text style={styles.symbol}>{token.symbol}</Text>
              </TokenSharedContent>
            </SharedElement>
          </View>

          <View style={styles.valueContainer}>
            <SharedElement
              id={`token.${token.id}.value`}
              groupId={`token.${token.id}`}
              transition={tokenValueTransition}
              portalStyle={styles.portal}
            >
              <TokenSharedContent>
                <Text style={styles.value}>{formatMoney(token.price)}</Text>
              </TokenSharedContent>
            </SharedElement>

            <SharedElement
              id={`token.${token.id}.change`}
              groupId={`token.${token.id}`}
              transition={tokenValueTransition}
              portalStyle={styles.portal}
            >
              <TokenSharedContent>
                <Text
                  style={[
                    styles.change,
                    isPositiveChange
                      ? styles.changePositive
                      : styles.changeNegative,
                  ]}
                >
                  {isPositiveChange ? '+' : ''}
                  {token.change24h.toFixed(2)}%
                </Text>
              </TokenSharedContent>
            </SharedElement>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  portal: { flex: 0, width: 'auto', height: 'auto' },
  pressable: {
    marginHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  pressed: {
    opacity: 0.65,
  },
  rowContainer: {
    borderRadius: 0,
    backgroundColor: theme.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    minHeight: 84,
  },
  info: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'flex-start',
    gap: 4,
  },
  name: {
    fontSize: 16,
    lineHeight: 22.4,
    fontFamily: theme.font,
    fontWeight: '600',
    color: theme.text,
  },
  symbol: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.secondary,
    fontFamily: theme.font,
  },
  valueContainer: {
    alignItems: 'flex-end',
    gap: 6,
  },
  value: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: theme.numbers,
    color: theme.text,
  },
  change: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: theme.numbers,
  },
  changePositive: {
    color: theme.positive,
  },
  changeNegative: {
    color: theme.negative,
  },
});

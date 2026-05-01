import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SharedElement } from 'react-native-screen-choreography';
import type { Token } from './data';
import { theme } from '../theme';
import { TokenLogo } from './TokenLogo';
import {
  tokenCardTransition,
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
    <Pressable onPress={onPress} style={styles.pressable}>
      <SharedElement
        id={`token.${token.id}.card`}
        groupId={`token.${token.id}`}
        transition={tokenCardTransition}
        style={styles.rowContainer}
      >
        <View style={styles.row}>
          <SharedElement
            id={`token.${token.id}.icon`}
            groupId={`token.${token.id}`}
            transition={tokenIconTransition}
          >
            <TokenLogo token={token} size={44} />
          </SharedElement>

          <View style={styles.info}>
            <SharedElement
              id={`token.${token.id}.name`}
              groupId={`token.${token.id}`}
              transition={tokenTextTransition}
            >
              <Text style={styles.name}>{token.name}</Text>
            </SharedElement>

            <SharedElement
              id={`token.${token.id}.symbol`}
              groupId={`token.${token.id}`}
              transition={tokenTextTransition}
            >
              <Text style={styles.symbol}>{token.symbol}</Text>
            </SharedElement>
          </View>

          <View style={styles.valueContainer}>
            <SharedElement
              id={`token.${token.id}.value`}
              groupId={`token.${token.id}`}
              transition={tokenValueTransition}
            >
              <Text style={styles.value}>
                $
                {token.value.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}
              </Text>
            </SharedElement>

            <SharedElement
              id={`token.${token.id}.change`}
              groupId={`token.${token.id}`}
              transition={tokenValueTransition}
            >
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
            </SharedElement>
          </View>
        </View>
      </SharedElement>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    marginHorizontal: 16,
    marginVertical: 6,
  },
  rowContainer: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
    color: 'white',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  symbol: {
    fontSize: 13,
    color: theme.textMuted,
    marginTop: 2,
  },
  valueContainer: {
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  change: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  changePositive: {
    color: theme.success,
  },
  changeNegative: {
    color: theme.danger,
  },
});

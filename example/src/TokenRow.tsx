import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SharedElement } from 'react-native-screen-choreography';
import type { Token } from './data';

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
        config={{ animation: 'morph' }}
        style={styles.rowContainer}
      >
        <View style={styles.row}>
          <SharedElement
            id={`token.${token.id}.icon`}
            groupId={`token.${token.id}`}
            config={{ animation: 'move-resize' }}
          >
            <View
              style={[styles.iconContainer, { backgroundColor: token.color }]}
            >
              <Text style={styles.iconText}>{token.icon}</Text>
            </View>
          </SharedElement>

          <View style={styles.info}>
            <SharedElement
              id={`token.${token.id}.name`}
              groupId={`token.${token.id}`}
              config={{ animation: 'move-resize' }}
            >
              <Text style={styles.name}>{token.name}</Text>
            </SharedElement>

            <SharedElement
              id={`token.${token.id}.symbol`}
              groupId={`token.${token.id}`}
              config={{ animation: 'move-resize' }}
            >
              <Text style={styles.symbol}>{token.symbol}</Text>
            </SharedElement>
          </View>

          <View style={styles.valueContainer}>
            <SharedElement
              id={`token.${token.id}.value`}
              groupId={`token.${token.id}`}
              config={{ animation: 'crossfade' }}
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
              config={{ animation: 'crossfade' }}
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
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.06)',
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
    color: '#1C1C1E',
  },
  symbol: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  valueContainer: {
    alignItems: 'flex-end',
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  change: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  changePositive: {
    color: '#34C759',
  },
  changeNegative: {
    color: '#FF3B30',
  },
});

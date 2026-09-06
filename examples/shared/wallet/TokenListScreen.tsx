import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  StatusBar,
  Pressable,
} from 'react-native';
import { SafeAreaView, useExampleNavigation } from '../runtime';
import { TokenRow } from './TokenRow';
import { TOKENS } from './data';
import { formatMoney, walletTheme as theme } from './walletTheme';
import { WalletIconButton } from './WalletIcon';

const portfolioValue = TOKENS.reduce((total, token) => total + token.value, 0);
const previousValue = TOKENS.reduce(
  (total, token) => total + token.value / (1 + token.change24h / 100),
  0
);
const dailyChange = portfolioValue - previousValue;
const dailyPercent = (dailyChange / previousValue) * 100;

export function TokenListScreen() {
  const { navigate, goBack } = useExampleNavigation();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [filter, setFilter] = useState<'all' | 'gainers'>('all');
  const tokens =
    filter === 'all' ? TOKENS : TOKENS.filter((token) => token.change24h > 0);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <View style={styles.toolbar}>
        <WalletIconButton
          icon="back"
          label="Back to examples"
          onPress={() => goBack()}
        />
        <Text accessibilityRole="header" style={styles.title}>
          Wallet
        </Text>
        <View style={styles.currency}>
          <Text style={styles.currencyText}>USD</Text>
        </View>
      </View>
      <FlatList
        data={tokens}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <View style={styles.overview}>
              <View style={styles.balanceHeading}>
                <Text style={styles.eyebrow}>DEMO PORTFOLIO</Text>
                <WalletIconButton
                  icon={balanceVisible ? 'eye' : 'eyeOff'}
                  label={
                    balanceVisible
                      ? 'Hide portfolio balance'
                      : 'Show portfolio balance'
                  }
                  onPress={() => setBalanceVisible(!balanceVisible)}
                />
              </View>
              <Text
                style={styles.balance}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {balanceVisible ? formatMoney(portfolioValue) : '******'}
              </Text>
              <View style={styles.performance}>
                <Text style={styles.gain}>
                  {balanceVisible
                    ? `+${formatMoney(dailyChange)} (${dailyPercent.toFixed(2)}%)`
                    : '******'}
                </Text>
                <Text style={styles.secondary}>past 24h</Text>
              </View>
              <View
                style={styles.allocation}
                accessibilityLabel="Portfolio allocation"
              >
                {TOKENS.map((token) => (
                  <View
                    key={token.id}
                    style={{
                      flex: token.value / portfolioValue,
                      backgroundColor: token.color,
                    }}
                  />
                ))}
              </View>
              <View style={styles.allocationLabels}>
                <Text style={styles.secondary}>6 assets</Text>
                <Text style={styles.secondary}>100% crypto</Text>
              </View>
            </View>
            <View style={styles.sectionHeader}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Assets
              </Text>
              <View style={styles.filters} accessibilityRole="tablist">
                {(['all', 'gainers'] as const).map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: option === filter }}
                    onPress={() => setFilter(option)}
                    style={[
                      styles.filter,
                      option === filter && styles.filterSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        option === filter && styles.filterTextSelected,
                      ]}
                    >
                      {option === 'all' ? 'All' : 'Gainers'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.columnLabels}>
              <Text style={styles.eyebrow}>ASSET</Text>
              <Text style={styles.eyebrow}>PRICE / 24H</Text>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <TokenRow
            token={item}
            onPress={() =>
              navigate(
                { screen: 'TokenDetail', params: { tokenId: item.id } },
                { transitionConfig: { group: `token.${item.id}` } }
              )
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  title: {
    flex: 1,
    fontFamily: theme.font,
    fontSize: 20,
    fontWeight: '600',
    color: theme.text,
    marginLeft: 4,
  },
  currency: { width: 44, alignItems: 'center' },
  currencyText: {
    fontFamily: theme.numbers,
    fontSize: 12,
    color: theme.secondary,
  },
  list: { paddingBottom: 32 },
  overview: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  balanceHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: theme.font,
    fontSize: 10,
    fontWeight: '600',
    color: theme.secondary,
    letterSpacing: 0,
  },
  balance: {
    fontFamily: theme.numbers,
    fontSize: 36,
    color: theme.text,
    lineHeight: 48,
  },
  performance: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  gain: { fontFamily: theme.numbers, fontSize: 12, color: theme.accent },
  secondary: { fontFamily: theme.font, fontSize: 12, color: theme.secondary },
  allocation: {
    height: 5,
    flexDirection: 'row',
    gap: 3,
    marginTop: 28,
    overflow: 'hidden',
    borderRadius: 2,
  },
  allocationLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  sectionHeader: {
    paddingHorizontal: 24,
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: theme.font,
    fontSize: 21,
    fontWeight: '600',
    color: theme.text,
  },
  filters: { flexDirection: 'row', gap: 4 },
  filter: {
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterSelected: { borderBottomColor: theme.accent },
  filterText: { fontFamily: theme.font, fontSize: 13, color: theme.secondary },
  filterTextSelected: { color: theme.accent },
  columnLabels: {
    marginHorizontal: 24,
    marginTop: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
});

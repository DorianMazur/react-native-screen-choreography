import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import {
  SafeAreaView,
  useChoreographyControls,
  useExampleNavigation,
} from '../runtime';
import { TOKENS } from './data';
import { formatMoney, walletTheme as theme } from './walletTheme';
import { WalletIconButton } from './WalletIcon';
import { PriceHistory } from './PriceHistory';
import { walletTransition } from './walletTransitions';

const websites: Record<string, string> = {
  polygon: 'https://polygon.technology',
  ethereum: 'https://ethereum.org',
  bitcoin: 'https://bitcoin.org',
  solana: 'https://solana.com',
  avalanche: 'https://avax.network',
  chainlink: 'https://chain.link',
};
const portfolioValue = TOKENS.reduce((total, token) => total + token.value, 0);

export function TokenDetailScreen({
  tokenId = 'polygon',
}: {
  tokenId?: string;
}) {
  const token = TOKENS.find((item) => item.id === tokenId) ?? TOKENS[0]!;
  const { goBack } = useExampleNavigation();
  const { settleTransition } = useChoreographyControls();
  const allocation = (token.value / portfolioValue) * 100;

  const openWebsite = () => {
    settleTransition();
    const url = websites[token.id];
    if (url) {
      Linking.openURL(url).catch(() => {
        Alert.alert('Unable to open website', 'Please try again later.');
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.toolbar}>
        <WalletIconButton
          icon="back"
          label="Back to wallet"
          onPress={() => goBack()}
        />
        <Text style={styles.toolbarTitle}>Asset overview</Text>
        <WalletIconButton
          icon="external"
          label={`Open ${token.name} website`}
          onPress={openWebsite}
        />
      </View>
      <ScrollView
        onScrollBeginDrag={settleTransition}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailCard}>
          <View style={styles.cardContent}>
            <View style={styles.headerRow}>
              <walletTransition.Element.Target
                name="icon"
                groupId={`token.${token.id}`}
                style={styles.iconTarget}
                metadata={{ scale: 48 / 44 }}
              />

              <View style={styles.headerInfo}>
                <walletTransition.Element.Target
                  name="name"
                  groupId={`token.${token.id}`}
                  style={styles.nameTarget}
                  metadata={{ scale: 22 / 16 }}
                />
                <walletTransition.Element.Target
                  name="symbol"
                  groupId={`token.${token.id}`}
                  style={styles.symbolTarget}
                  metadata={{ scale: 1 }}
                />
              </View>
            </View>

            <View style={styles.valueSection}>
              <walletTransition.Element.Target
                name="value"
                groupId={`token.${token.id}`}
                style={styles.valueTarget}
                metadata={{ scale: 36 / 15 }}
              />
              <View style={styles.changeRow}>
                <walletTransition.Element.Target
                  name="change"
                  groupId={`token.${token.id}`}
                  style={styles.changeTarget}
                  metadata={{ scale: 1 }}
                />
                <walletTransition.Enter name="period">
                  <Text style={styles.periodLabel}>past 24h</Text>
                </walletTransition.Enter>
              </View>
            </View>
          </View>
        </View>

        <walletTransition.Enter name="history">
          <PriceHistory
            key={token.id}
            token={token}
            onInteract={settleTransition}
          />
        </walletTransition.Enter>
        <walletTransition.Enter name="holdings">
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Your position
              </Text>
              <Text style={styles.demoLabel}>DEMO</Text>
            </View>
            <Text style={styles.balanceValue}>{formatMoney(token.value)}</Text>
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
              <Text style={styles.periodLabel}>Portfolio weight</Text>
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
        </walletTransition.Enter>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  iconTarget: { width: 48, height: 48 },
  nameTarget: { width: '100%', height: 31 },
  symbolTarget: { width: '100%', height: 18 },
  valueTarget: { width: '100%', height: 51 },
  changeTarget: { width: 100, height: 18 },

  container: { flex: 1, backgroundColor: theme.background },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  toolbarTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.font,
    fontSize: 14,
    color: theme.secondary,
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  detailCard: {
    marginHorizontal: 24,
    borderRadius: 0,
    backgroundColor: theme.background,
  },
  cardContent: { paddingVertical: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerInfo: { marginLeft: 14, flex: 1, alignItems: 'flex-start', gap: 2 },
  detailName: {
    fontFamily: theme.font,
    fontSize: 22,
    lineHeight: 30.8,
    fontWeight: '600',
    color: theme.text,
  },
  detailSymbol: {
    fontFamily: theme.font,
    fontSize: 13,
    lineHeight: 18,
    color: theme.secondary,
  },
  valueSection: { marginTop: 24, alignItems: 'flex-start' },
  detailPrice: {
    fontFamily: theme.numbers,
    fontSize: 36,
    lineHeight: 50.4,
    color: theme.text,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  detailChange: { fontFamily: theme.numbers, fontSize: 13, lineHeight: 18 },
  detailChangePositive: { color: theme.positive },
  detailChangeNegative: { color: theme.negative },
  periodLabel: { fontFamily: theme.font, fontSize: 12, color: theme.secondary },
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
  balanceAmount: {
    fontFamily: theme.numbers,
    fontSize: 13,
    color: theme.secondary,
    marginTop: 6,
  },
  balanceValue: {
    fontFamily: theme.numbers,
    fontSize: 26,
    color: theme.text,
    marginTop: 18,
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

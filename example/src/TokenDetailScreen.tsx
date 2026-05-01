import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChoreographyScreen,
  SharedElement,
  useChoreographyProgress,
  useChoreographyNavigation,
  useLatchedReveal,
  useStaggeredReveal,
} from 'react-native-screen-choreography';
import { TOKENS } from './data';
import {
  tokenCardTransition,
  tokenIconTransition,
  tokenTextTransition,
  tokenValueTransition,
} from './sharedTransitions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function TokenDetailScreen({
  route,
  navigation,
}: {
  route: any;
  navigation: any;
}) {
  const tokenId = route.params?.tokenId ?? 'polygon';
  const token = TOKENS.find((t) => t.id === tokenId) ?? TOKENS[0]!;
  const isPositiveChange = token.change24h >= 0;
  const { goBack } = useChoreographyNavigation(navigation);
  const { settleTransition } = useChoreographyProgress();
  const shouldShowDetailSections = useLatchedReveal({ resetKey: token.id });
  const { getItemStyle } = useStaggeredReveal(5, { stagger: 0.04 });
  const balanceSectionStyle = getItemStyle(0);
  const aboutSectionStyle = getItemStyle(1);
  const statsSectionStyle = getItemStyle(2);
  const activitySectionStyle = getItemStyle(3);
  const actionRowStyle = getItemStyle(4);

  return (
    <ChoreographyScreen screenId="TokenDetail">
      <SafeAreaView style={styles.container}>
        <ScrollView
          onScrollBeginDrag={settleTransition}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => goBack()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <SharedElement
            id={`token.${token.id}.card`}
            groupId={`token.${token.id}`}
            transition={tokenCardTransition}
            style={styles.detailCard}
          >
            <View style={styles.cardContent}>
              <View style={styles.headerRow}>
                <SharedElement
                  id={`token.${token.id}.icon`}
                  groupId={`token.${token.id}`}
                  transition={tokenIconTransition}
                >
                  <View
                    style={[
                      styles.iconContainer,
                      { backgroundColor: token.color },
                    ]}
                  >
                    <Text style={styles.iconText}>{token.icon}</Text>
                  </View>
                </SharedElement>

                <View style={styles.headerInfo}>
                  <SharedElement
                    id={`token.${token.id}.name`}
                    groupId={`token.${token.id}`}
                    transition={tokenTextTransition}
                  >
                    <Text style={styles.detailName}>{token.name}</Text>
                  </SharedElement>
                  <SharedElement
                    id={`token.${token.id}.symbol`}
                    groupId={`token.${token.id}`}
                    transition={tokenTextTransition}
                  >
                    <Text style={styles.detailSymbol}>{token.symbol}</Text>
                  </SharedElement>
                </View>
              </View>

              <View style={styles.valueSection}>
                <SharedElement
                  id={`token.${token.id}.value`}
                  groupId={`token.${token.id}`}
                  transition={tokenValueTransition}
                >
                  <Text style={styles.detailPrice}>
                    $
                    {token.price.toLocaleString('en-US', {
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
                      styles.detailChange,
                      isPositiveChange
                        ? styles.detailChangePositive
                        : styles.detailChangeNegative,
                    ]}
                  >
                    {isPositiveChange ? '+' : ''}
                    {token.change24h.toFixed(2)}% today
                  </Text>
                </SharedElement>
              </View>
            </View>
          </SharedElement>

          {shouldShowDetailSections ? (
            <>
              <Animated.View style={[styles.section, balanceSectionStyle]}>
                <Text style={styles.sectionTitle}>Your Balance</Text>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceAmount}>
                    {token.balance.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}{' '}
                    {token.symbol}
                  </Text>
                  <Text style={styles.balanceValue}>
                    $
                    {token.value.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
                  </Text>
                </View>
              </Animated.View>

              <Animated.View style={[styles.section, aboutSectionStyle]}>
                <Text style={styles.sectionTitle}>About {token.name}</Text>
                <Text style={styles.description}>{token.description}</Text>
              </Animated.View>

              <Animated.View style={[styles.section, statsSectionStyle]}>
                <Text style={styles.sectionTitle}>Market Stats</Text>
                <View style={styles.statsGrid}>
                  <StatItem label="Market Cap" value="$8.2B" />
                  <StatItem label="Volume (24h)" value="$423M" />
                  <StatItem label="Circulating" value="9.3B" />
                  <StatItem label="Max Supply" value="10B" />
                </View>
              </Animated.View>

              <Animated.View style={[styles.section, activitySectionStyle]}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                <ActivityItem
                  type="Received"
                  amount={`+50 ${token.symbol}`}
                  date="2 hours ago"
                />
                <ActivityItem
                  type="Sent"
                  amount={`-12.5 ${token.symbol}`}
                  date="Yesterday"
                />
                <ActivityItem
                  type="Swapped"
                  amount={`+125 ${token.symbol}`}
                  date="3 days ago"
                />
              </Animated.View>

              <Animated.View style={[styles.actionRow, actionRowStyle]}>
                <Pressable
                  style={[
                    styles.actionButton,
                    { backgroundColor: token.color },
                  ]}
                >
                  <Text style={styles.actionButtonText}>Swap</Text>
                </Pressable>
                <Pressable style={[styles.actionButton, styles.sendButton]}>
                  <Text
                    style={[styles.actionButtonText, styles.sendButtonText]}
                  >
                    Send
                  </Text>
                </Pressable>
              </Animated.View>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ChoreographyScreen>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function ActivityItem({
  type,
  amount,
  date,
}: {
  type: string;
  amount: string;
  date: string;
}) {
  return (
    <View style={styles.activityItem}>
      <View style={styles.activityDot} />
      <View style={styles.activityInfo}>
        <Text style={styles.activityType}>{type}</Text>
        <Text style={styles.activityDate}>{date}</Text>
      </View>
      <Text style={styles.activityAmount}>{amount}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backText: {
    fontSize: 17,
    color: '#000000',
    fontWeight: '600',
  },
  detailCard: {
    marginHorizontal: 16,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.04)',
  },
  cardContent: {
    padding: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 26,
    color: 'white',
  },
  headerInfo: {
    marginLeft: 16,
    flex: 1,
  },
  detailName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  detailSymbol: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 2,
  },
  valueSection: {
    marginTop: 20,
  },
  detailPrice: {
    fontSize: 34,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: 0.37,
  },
  detailChange: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 4,
  },
  detailChangePositive: {
    color: '#34C759',
  },
  detailChangeNegative: {
    color: '#FF3B30',
  },
  section: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.04)',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceAmount: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  balanceValue: {
    fontSize: 17,
    color: '#8E8E93',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: '#3C3C43',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    width: (SCREEN_WIDTH - 76) / 2,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 14,
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 4,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityType: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  activityDate: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  activityAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sendButton: {
    backgroundColor: '#E5E5EA',
  },
  sendButtonText: {
    color: '#1C1C1E',
  },
});

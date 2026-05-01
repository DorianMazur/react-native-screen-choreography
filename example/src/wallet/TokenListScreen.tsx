import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  StatusBar,
  Pressable,
} from 'react-native';
import {
  ChoreographyScreen,
  useChoreographyNavigation,
} from 'react-native-screen-choreography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TokenRow } from './TokenRow';
import { TOKENS } from './data';
import { theme } from '../theme';

export function TokenListScreen({ navigation }: { navigation: any }) {
  const { navigate } = useChoreographyNavigation(navigation);

  return (
    <ChoreographyScreen screenId="TokenList">
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Wallet</Text>
          <Text style={styles.totalValue}>$22,384.49</Text>
          <Text style={styles.totalChange}>+$847.23 (3.93%) today</Text>
        </View>

        <FlatList
          data={TOKENS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TokenRow
              token={item}
              onPress={() => {
                navigate(
                  'TokenDetail',
                  { tokenId: item.id },
                  {
                    transitionConfig: {
                      group: `token.${item.id}`,
                    },
                  }
                );
              }}
            />
          )}
        />
      </SafeAreaView>
    </ChoreographyScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },
  back: {
    color: theme.textSecondary,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: theme.text,
    letterSpacing: -0.4,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '600',
    color: theme.text,
    marginTop: 4,
  },
  totalChange: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.success,
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 40,
  },
});

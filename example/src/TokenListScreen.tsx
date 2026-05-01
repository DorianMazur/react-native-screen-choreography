import React from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar } from 'react-native';
import {
  ChoreographyScreen,
  useChoreographyNavigation,
} from 'react-native-screen-choreography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TokenRow } from './TokenRow';
import { TOKENS } from './data';

export function TokenListScreen({ navigation }: { navigation: any }) {
  const { navigate } = useChoreographyNavigation(navigation);

  return (
    <ChoreographyScreen screenId="TokenList">
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.header}>
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
    backgroundColor: '#F2F2F7',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: 0.37,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 4,
  },
  totalChange: {
    fontSize: 15,
    fontWeight: '500',
    color: '#34C759',
    marginTop: 2,
  },
  listContent: {
    paddingBottom: 40,
  },
});

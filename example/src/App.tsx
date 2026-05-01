import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChoreographyProvider } from 'react-native-screen-choreography';
import { TokenListScreen } from './TokenListScreen';
import { TokenDetailScreen } from './TokenDetailScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <ChoreographyProvider debug={false}>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'none',
            }}
          >
            <Stack.Screen name="TokenList" component={TokenListScreen} />
            <Stack.Screen
              name="TokenDetail"
              component={TokenDetailScreen}
              options={{
                presentation: 'containedTransparentModal',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ChoreographyProvider>
    </SafeAreaProvider>
  );
}

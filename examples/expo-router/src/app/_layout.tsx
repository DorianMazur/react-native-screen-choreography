import { ThemeProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChoreographyProvider } from 'react-native-screen-choreography/expo-router';
import { theme as palette } from '../../../shared/theme';

const theme = {
  dark: true,
  colors: {
    primary: palette.accent,
    background: palette.bg,
    card: palette.bg,
    text: palette.text,
    border: palette.border,
    notification: palette.danger,
  },
  fonts: {
    regular: { fontFamily: 'Avenir', fontWeight: '400' as const },
    medium: { fontFamily: 'Avenir', fontWeight: '500' as const },
    bold: { fontFamily: 'Avenir', fontWeight: '700' as const },
    heavy: { fontFamily: 'Avenir', fontWeight: '800' as const },
  },
};

export default function RootLayout() {
  return (
    <ChoreographyProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'none',
            contentStyle: { backgroundColor: palette.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen
            name="gallery/[photoId]"
            options={{
              presentation: 'containedTransparentModal',
              contentStyle: { backgroundColor: 'transparent' },
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="music/[trackId]"
            options={{
              presentation: 'containedTransparentModal',
              contentStyle: { backgroundColor: 'transparent' },
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="wallet/[tokenId]"
            options={{
              presentation: 'containedTransparentModal',
              contentStyle: { backgroundColor: 'transparent' },
              gestureEnabled: false,
            }}
          />
          <Stack.Screen
            name="live-player/detail"
            options={{
              presentation: 'containedTransparentModal',
              contentStyle: { backgroundColor: 'transparent' },
              gestureEnabled: false,
            }}
          />
        </Stack>
      </ThemeProvider>
    </ChoreographyProvider>
  );
}

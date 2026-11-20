import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ThemeProvider, Stack } from 'expo-router';
import { trayStackLayout } from 'react-native-screen-choreography/expo-router/tray';
import { StatusBar } from 'expo-status-bar';
import { theme as palette } from '@screen-choreography/example-shared';

// Supply the screen underneath a tray when its URL opens a fresh app.
export const unstable_settings = { anchor: '(app)' };

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
    <KeyboardProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack layout={trayStackLayout}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="wallet-tray" />
          <Stack.Screen name="gallery-tray" />
        </Stack>
      </ThemeProvider>
    </KeyboardProvider>
  );
}

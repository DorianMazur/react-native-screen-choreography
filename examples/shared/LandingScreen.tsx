import { ScrollView, StatusBar, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TrayDemoLauncher } from './tray/TrayDemo';
import { GalleryPlusTrayLauncher } from './tray/GalleryPlusTray';
import { theme } from './theme';

export function LandingScreen({
  openWallet,
  openGallery,
}: {
  openWallet: () => void;
  openGallery: () => void;
}) {
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Dynamic trays
        </Text>
        <TrayDemoLauncher onPress={openWallet} />
        <GalleryPlusTrayLauncher onPress={openGallery} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 24, paddingTop: 48, gap: 12 },
  title: {
    fontSize: 38,
    color: theme.text,
    fontWeight: '600',
    letterSpacing: -1.4,
    marginBottom: 16,
  },
});

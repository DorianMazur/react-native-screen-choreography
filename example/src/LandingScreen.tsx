import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientBlock } from './GradientBlock';
import { theme } from './theme';

interface DemoTileProps {
  label: string;
  title: string;
  subtitle: string;
  from: string;
  to: string;
  onPress: () => void;
}

function DemoTile({
  label,
  title,
  subtitle,
  from,
  to,
  onPress,
}: DemoTileProps) {
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <GradientBlock from={from} to={to} style={styles.tileBg}>
        <View style={styles.tileContent}>
          <View style={styles.tileTop}>
            <Text style={styles.tileLabel}>{label}</Text>
          </View>
          <View>
            <Text style={styles.tileTitle}>{title}</Text>
            <Text style={styles.tileSubtitle}>{subtitle}</Text>
          </View>
        </View>
        <View style={styles.tileShade} pointerEvents="none" />
      </GradientBlock>
    </Pressable>
  );
}

export function LandingScreen({ navigation }: { navigation: any }) {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.eyebrow}>react-native-screen-choreography</Text>
            <Text style={styles.title}>Choreographed{'\n'}transitions.</Text>
            <Text style={styles.lede}>
              Multi-element shared transitions for React Native, with
              progress-driven companion motion and a native overlay above the
              navigation stack.
            </Text>
          </View>

          <View style={styles.tiles}>
            <DemoTile
              label="01 · Gallery"
              title="Photo grid → hero"
              subtitle="Aspect-preserved morph, layered reveal."
              from="#3A1052"
              to="#FF8FB1"
              onPress={() => navigation.navigate('GalleryList')}
            />
            <DemoTile
              label="02 · Music"
              title="Track row → Now Playing"
              subtitle="Artwork, title, ambient backdrop, waveform."
              from="#0F2B5B"
              to="#3DDC97"
              onPress={() => navigation.navigate('MusicList')}
            />
            <DemoTile
              label="03 · Wallet"
              title="Token list → detail"
              subtitle="Card morph, cross-fading text, staggered sections."
              from="#1B1B3A"
              to="#7C5CFF"
              onPress={() => navigation.navigate('TokenList')}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Each demo uses one ChoreographyProvider, one progress value, and a
              different visual recipe.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 28,
  },
  eyebrow: {
    color: theme.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.text,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: -0.8,
    lineHeight: 48,
    marginTop: 10,
  },
  lede: {
    color: theme.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
    maxWidth: 380,
  },
  tiles: {
    paddingHorizontal: 16,
    gap: 14,
  },
  tile: {
    height: 160,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  tileBg: {
    flex: 1,
    borderRadius: theme.radius.xl,
  },
  tileContent: {
    flex: 1,
    padding: 22,
    justifyContent: 'space-between',
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tileLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tileGlyph: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 28,
    fontWeight: '300',
  },
  tileTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  tileSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    marginTop: 4,
  },
  tileShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.10)',
    borderRadius: theme.radius.xl,
  },
  footer: {
    paddingHorizontal: 28,
    paddingTop: 32,
  },
  footerText: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
});

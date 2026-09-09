import { useEffect, type ComponentProps } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  SlideInDown,
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { AppIcon, IconButton } from '../AppChrome';
import {
  SharedElement,
  makeSurfaceTransition,
  useChoreographyProgress,
  useExampleNavigation,
  useSafeAreaInsets,
} from '../runtime';
import { theme } from '../theme';
import { setupOptionTransition } from './setupTransitions';

const groupId = 'wallet-setup';
const surfaceTransition = makeSurfaceTransition();
type IconName = ComponentProps<typeof AppIcon>['name'];

const newOptions: {
  title: string;
  description: string;
  icon: IconName;
  color: string;
}[] = [
  {
    title: 'Create new',
    description: 'A fresh wallet. A new beginning.',
    icon: 'plus',
    color: theme.accent,
  },
  {
    title: 'Add existing',
    description: 'Bring a wallet you already own.',
    icon: 'restore',
    color: theme.success,
  },
  {
    title: 'Watch a wallet',
    description: 'Follow an address or an ENS name.',
    icon: 'eye',
    color: theme.warn,
  },
];

const existingOptions: {
  title: string;
  description: string;
  icon: IconName;
  color: string;
}[] = [
  {
    title: 'Log in to your account',
    description: 'Find the wallets saved to your account',
    icon: 'user',
    color: theme.accent,
  },
  {
    title: 'Import',
    description: 'Use a recovery phrase or private key',
    icon: 'download',
    color: theme.success,
  },
  {
    title: 'Restore',
    description: 'Recover a wallet from your cloud backup',
    icon: 'cloud',
    color: theme.warn,
  },
];

function SetupOption({
  option,
  index,
  onPress,
  outlined = false,
}: {
  option: (typeof newOptions)[number];
  index: number;
  onPress: () => void;
  outlined?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.title}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <SharedElement
        id={`wallet-setup.option.${index}`}
        groupId={groupId}
        style={[styles.option, outlined && styles.outlined]}
        transition={setupOptionTransition}
      >
        <View style={styles.optionContent}>
          <View style={[styles.optionIcon, { backgroundColor: option.color }]}>
            <AppIcon name={option.icon} color={theme.ink} size={23} />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>{option.title}</Text>
            <Text style={styles.secondary}>{option.description}</Text>
          </View>
          <AppIcon name="arrow" color={theme.textMuted} size={16} />
        </View>
      </SharedElement>
    </Pressable>
  );
}

function useWalletCardWiggle(wiggle: SharedValue<number>, index: number) {
  return useAnimatedStyle(() => {
    const phase = interpolate(
      wiggle.value,
      [index * 0.08, 0.84 + index * 0.08],
      [0, 1],
      'clamp'
    );
    const amplitude = (index === 1 ? -1 : 1) * (2.4 - index * 0.4);
    const rotation =
      amplitude * Math.sin(phase * Math.PI * 3) * (1 - phase) ** 2;
    return {
      transformOrigin: '50% 100%',
      transform: [{ rotateZ: `${rotation}deg` }],
    };
  });
}

function WalletArtwork({
  height,
  wiggle,
}: {
  height: number;
  wiggle: SharedValue<number>;
}) {
  const backWiggle = useWalletCardWiggle(wiggle, 0);
  const middleWiggle = useWalletCardWiggle(wiggle, 1);
  const frontWiggle = useWalletCardWiggle(wiggle, 2);

  return (
    <View accessible={false} style={[styles.artwork, { height }]}>
      <Animated.View style={[styles.artCard, styles.backCard, backWiggle]} />
      <Animated.View
        style={[styles.artCard, styles.middleCard, middleWiggle]}
      />
      <Animated.View style={[styles.artCard, styles.frontCard, frontWiggle]}>
        <View style={styles.artCardTop}>
          <AppIcon name="wallet" color={theme.ink} size={28} />
          <View style={styles.artChip} />
        </View>
        <Text style={styles.artCardLabel}>A place for your possibilities.</Text>
      </Animated.View>
    </View>
  );
}

export function WalletSetupScreen() {
  const { navigate, goBack } = useExampleNavigation();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const actions = [
    () =>
      Alert.alert(
        'Create a wallet',
        'This sample does not generate keys or store funds.',
        [{ text: 'Done', onPress: () => goBack() }]
      ),
    () =>
      navigate(
        { screen: 'WalletExisting' },
        { transitionConfig: { group: groupId } }
      ),
    () =>
      Alert.alert(
        'Watch a wallet',
        'Wallet watching is a preview in this sample. No address is saved.'
      ),
  ];

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <StatusBar barStyle="light-content" />
      <Animated.View
        entering={FadeIn.duration(reduceMotion ? 0 : 180)}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss new wallet"
          style={styles.scrim}
          onPress={() => goBack()}
        />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(reduceMotion ? 0 : 360).easing(
          Easing.out(Easing.cubic)
        )}
        style={[
          styles.sheet,
          {
            marginBottom: Math.max(insets.bottom, 12),
            maxHeight: height - insets.top - 24,
          },
        ]}
      >
        <SharedElement
          id="wallet-setup.surface"
          groupId={groupId}
          style={[StyleSheet.absoluteFill, styles.sheetSurface]}
          transition={surfaceTransition}
        >
          <View style={styles.spacer} />
        </SharedElement>
        <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
          <SharedElement
            id="wallet-setup.header"
            groupId={groupId}
            transition={setupOptionTransition}
          >
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                New wallet
              </Text>
              <IconButton
                icon="close"
                label="Close new wallet"
                onPress={() => goBack()}
              />
            </View>
          </SharedElement>
          <SharedElement
            id="wallet-setup.hero"
            groupId={groupId}
            style={styles.heroOrigin}
            transition={setupOptionTransition}
          >
            <View />
          </SharedElement>
          <View style={styles.options}>
            {newOptions.map((option, index) => (
              <SetupOption
                key={option.title}
                option={option}
                index={index}
                onPress={actions[index]!}
              />
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

export function WalletExistingScreen() {
  const { goBack } = useExampleNavigation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const {
    progress,
    direction,
    groupId: activeGroup,
    role,
    phase,
  } = useChoreographyProgress();
  const reduceMotion = useReducedMotion();
  const wiggle = useSharedValue(1);
  useAnimatedReaction(
    () => ({
      finishing:
        direction === 'forward' &&
        activeGroup === groupId &&
        role === 'target' &&
        phase === 'active' &&
        progress.value >= 0.85,
      settled: phase === 'idle' && progress.value === 1,
    }),
    (current, previous) => {
      if (reduceMotion || (!current.finishing && !current.settled)) {
        cancelAnimation(wiggle);
        wiggle.value = 1;
      } else if (current.finishing && !previous?.finishing) {
        wiggle.value = 0;
        wiggle.value = withTiming(1, {
          duration: 520,
          easing: Easing.linear,
        });
      }
    },
    [direction, activeGroup, role, phase, reduceMotion, progress, wiggle]
  );
  useEffect(() => () => cancelAnimation(wiggle), [wiggle]);
  const artworkHeight = Math.max(88, Math.min(176, height * 0.2));
  const actions = [
    () =>
      Alert.alert(
        'No saved accounts',
        'There is no account connected to this sample.'
      ),
    () =>
      Alert.alert(
        'Keep your recovery phrase private',
        'Never enter a real recovery phrase or private key into a demo app.'
      ),
    () =>
      Alert.alert(
        'No backups found',
        'There are no wallet backups connected to this sample.'
      ),
  ];

  return (
    <View style={styles.modalScreen}>
      <StatusBar barStyle="light-content" />
      <SharedElement
        id="wallet-setup.surface"
        groupId={groupId}
        style={[StyleSheet.absoluteFill, styles.expandedSurface]}
        transition={surfaceTransition}
      >
        <View style={styles.spacer} />
      </SharedElement>
      <View style={{ paddingTop: insets.top }}>
        <SharedElement
          id="wallet-setup.header"
          groupId={groupId}
          transition={setupOptionTransition}
        >
          <View style={styles.expandedHeader}>
            <IconButton
              icon="close"
              label="Back to new wallet"
              onPress={() => goBack()}
            />
            <IconButton
              icon="help"
              label="Wallet recovery help"
              onPress={() =>
                Alert.alert(
                  'Your wallet, your keys',
                  'Only restore a wallet you own. Keep your recovery phrase offline and never share it.'
                )
              }
            />
          </View>
        </SharedElement>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.expandedContent,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <SharedElement
          id="wallet-setup.hero"
          groupId={groupId}
          transition={setupOptionTransition}
        >
          <View style={styles.hero}>
            <WalletArtwork height={artworkHeight} wiggle={wiggle} />
            <View style={styles.heroCopy}>
              <Text accessibilityRole="header" style={styles.heroTitle}>
                Add an existing wallet
              </Text>
              <Text style={styles.heroDescription}>
                A familiar wallet. A fresh start.{'\n'}Import or restore to pick
                up where you left off.
              </Text>
            </View>
          </View>
        </SharedElement>
        <View style={[styles.options, styles.expandedOptions]}>
          {existingOptions.map((option, index) => (
            <SetupOption
              key={option.title}
              option={option}
              index={index}
              outlined={index === 2}
              onPress={actions[index]!}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  modalScreen: { flex: 1 },
  sectionTitle: {
    fontFamily: theme.font,
    fontSize: 21,
    fontWeight: '600',
    color: theme.text,
  },
  spacer: { flex: 1 },
  pressed: { opacity: 0.65 },
  scrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.72)' },
  sheet: {
    marginHorizontal: 12,
    marginTop: 'auto',
    borderRadius: 8,
    overflow: 'hidden',
  },
  sheetSurface: { backgroundColor: theme.bgElevated, borderRadius: 8 },
  expandedSurface: { backgroundColor: theme.bg, borderRadius: 0 },
  sheetContent: { padding: 20, paddingTop: 8 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  heroOrigin: { height: 1, overflow: 'hidden', marginBottom: 18 },
  options: { gap: 12 },
  option: {
    backgroundColor: theme.surfaceElevated,
    borderRadius: 8,
    overflow: 'hidden',
  },
  outlined: {
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.borderStrong,
    borderStyle: 'dashed',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    minHeight: 104,
    gap: 14,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCopy: { flex: 1, gap: 5 },
  optionTitle: {
    fontFamily: theme.font,
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
  },
  secondary: {
    fontFamily: theme.font,
    fontSize: 13,
    lineHeight: 19,
    color: theme.textSecondary,
    flexShrink: 1,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  expandedContent: { flexGrow: 1 },
  expandedOptions: { paddingHorizontal: 24, paddingTop: 8 },
  hero: { paddingTop: 20 },
  heroCopy: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
    gap: 12,
  },
  heroTitle: {
    fontFamily: theme.font,
    fontSize: 25,
    lineHeight: 32,
    fontWeight: '600',
    color: theme.text,
    textAlign: 'center',
  },
  heroDescription: {
    fontFamily: theme.font,
    fontSize: 14,
    lineHeight: 21,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  artwork: {
    marginHorizontal: 44,
    overflow: 'hidden',
    maxWidth: 380,
    width: '78%',
    alignSelf: 'center',
  },
  artCard: { position: 'absolute', height: '100%', borderRadius: 8 },
  backCard: {
    top: 0,
    width: '76%',
    left: '12%',
    backgroundColor: theme.success,
  },
  middleCard: {
    top: 20,
    width: '88%',
    left: '6%',
    backgroundColor: theme.warn,
  },
  frontCard: {
    top: 40,
    width: '100%',
    padding: 20,
    backgroundColor: theme.accent,
  },
  artCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  artChip: {
    width: 56,
    height: 18,
    borderRadius: 4,
    backgroundColor: 'rgba(23, 34, 14, 0.16)',
  },
  artCardLabel: {
    fontFamily: theme.font,
    fontSize: 12,
    color: theme.ink,
    marginTop: 24,
  },
});

import { useEffect, type ComponentProps, type ReactNode } from 'react';
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
  interpolateColor,
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
  useSharedElementPresentation,
  useExampleNavigation,
  useSafeAreaInsets,
} from '../runtime';
import { theme } from '../theme';
import { surfaceTransition } from './setupTransitions';

const groupId = 'wallet-setup';
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

const recoveryActions = [
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

function WalletOption({
  index,
  onPress,
}: {
  index: number;
  onPress: () => void;
}) {
  const { progress, transitioning, settled } = useSharedElementPresentation();
  const compact = newOptions[index]!;
  const expanded = existingOptions[index]!;
  const surface = useAnimatedStyle(() => {
    const t = transitioning ? progress.value : settled === 'expanded' ? 1 : 0;
    return {
      backgroundColor: interpolateColor(
        t,
        [0, 1],
        [theme.surfaceElevated, index === 2 ? theme.bg : theme.surfaceElevated]
      ),
      borderColor: interpolateColor(
        t,
        [0, 1],
        ['transparent', index === 2 ? theme.borderStrong : 'transparent']
      ),
    };
  });
  // Change the contents inside one persistent button, without ghosting two
  // complete cards or moving the controls with the expanding panel's top.
  const compactStyle = useAnimatedStyle(() => {
    const t = transitioning ? progress.value : settled === 'expanded' ? 1 : 0;
    return {
      opacity: interpolate(t, [0.2, 0.45], [1, 0], 'clamp'),
      transform: [
        { translateY: interpolate(t, [0.2, 0.45], [0, -8], 'clamp') },
      ],
    };
  });
  const expandedStyle = useAnimatedStyle(() => {
    const t = transitioning ? progress.value : settled === 'expanded' ? 1 : 0;
    return {
      opacity: interpolate(t, [0.45, 0.78], [0, 1], 'clamp'),
      transform: [
        { translateY: interpolate(t, [0.45, 0.78], [8, 0], 'clamp') },
      ],
    };
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        settled === 'expanded' ? expanded.title : compact.title
      }
      disabled={transitioning}
      onPress={settled === 'expanded' ? recoveryActions[index] : onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Animated.View style={[styles.option, styles.persistentOption, surface]}>
        <View style={styles.optionContent}>
          <View style={[styles.optionIcon, { backgroundColor: compact.color }]}>
            <Animated.View style={[styles.iconLayer, compactStyle]}>
              <AppIcon name={compact.icon} color={theme.ink} size={23} />
            </Animated.View>
            <Animated.View style={[styles.iconLayer, expandedStyle]}>
              <AppIcon name={expanded.icon} color={theme.ink} size={23} />
            </Animated.View>
          </View>
          <View style={styles.optionCopy}>
            <Animated.View style={[styles.copyLayer, compactStyle]}>
              <Text style={styles.optionTitle}>{compact.title}</Text>
              <Text style={styles.secondary}>{compact.description}</Text>
            </Animated.View>
            <Animated.View style={[styles.copyLayer, expandedStyle]}>
              <Text style={styles.optionTitle}>{expanded.title}</Text>
              <Text style={styles.secondary}>{expanded.description}</Text>
            </Animated.View>
          </View>
          <AppIcon name="arrow" color={theme.textMuted} size={16} />
        </View>
      </Animated.View>
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
          style={[
            styles.sheetSurface,
            { height: Math.min(470, height - insets.top - insets.bottom - 24) },
          ]}
          transition={surfaceTransition}
        >
          <WalletPanel actions={actions}>
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              bounces={false}
            >
              <View>
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
              </View>
              <View style={styles.heroOrigin}>
                <View />
              </View>
              <View style={styles.optionsPlaceholder} />
            </ScrollView>
          </WalletPanel>
        </SharedElement>
      </Animated.View>
    </View>
  );
}

export function WalletExistingScreen() {
  const { goBack } = useExampleNavigation();
  return (
    <View style={styles.modalScreen}>
      <StatusBar barStyle="light-content" />
      <SharedElement.Target
        id="wallet-setup.surface"
        groupId={groupId}
        style={StyleSheet.absoluteFill}
        transition={surfaceTransition}
        metadata={{ onBack: goBack }}
      />
    </View>
  );
}

function WalletPanel({
  children,
  actions,
}: {
  children: ReactNode;
  actions: (() => void)[];
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { progress, transitioning, settled, collapsed, expanded } =
    useSharedElementPresentation();
  const fromWidth = collapsed.metrics?.width ?? width - 24;
  const fromHeight =
    collapsed.metrics?.height ??
    Math.min(470, height - insets.top - insets.bottom - 24);
  const toWidth = expanded.metrics?.width ?? width;
  const toHeight = expanded.metrics?.height ?? height;
  const bottomTravel =
    collapsed.metrics && expanded.metrics
      ? expanded.metrics.pageY + toHeight - collapsed.metrics.pageY - fromHeight
      : Math.max(insets.bottom, 12);
  const onBack =
    (expanded.metadata as { onBack?: () => void } | undefined)?.onBack ??
    (() => {});
  const panelStyle = useAnimatedStyle(() => {
    const t = transitioning ? progress.value : settled === 'expanded' ? 1 : 0;
    return {
      width: interpolate(t, [0, 1], [fromWidth, toWidth], 'clamp'),
      height: interpolate(t, [0, 1], [fromHeight, toHeight], 'clamp'),
      borderRadius: interpolate(t, [0, 1], [8, 0], 'clamp'),
      backgroundColor: interpolateColor(
        t,
        [0, 1],
        [theme.bgElevated, theme.bg]
      ),
    };
  });
  // Keep both header layouts aligned with the bottom-anchored controls.
  const collapsedPosition = useAnimatedStyle(() => ({
    bottom:
      (transitioning ? progress.value : settled === 'expanded' ? 1 : 0) *
      bottomTravel,
    left:
      (interpolate(
        transitioning ? progress.value : settled === 'expanded' ? 1 : 0,
        [0, 1],
        [fromWidth, toWidth],
        'clamp'
      ) -
        fromWidth) /
      2,
  }));
  const expandedPosition = useAnimatedStyle(() => {
    const t = transitioning ? progress.value : settled === 'expanded' ? 1 : 0;
    return {
      bottom: -(1 - t) * bottomTravel,
      left:
        (interpolate(t, [0, 1], [fromWidth, toWidth], 'clamp') - toWidth) / 2,
    };
  });
  const collapsedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      transitioning ? progress.value : settled === 'expanded' ? 1 : 0,
      [0, 0.18],
      [1, 0],
      'clamp'
    ),
  }));
  const expandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      transitioning ? progress.value : settled === 'expanded' ? 1 : 0,
      [0.35, 0.85],
      [0, 1],
      'clamp'
    ),
  }));
  const optionsStyle = useAnimatedStyle(() => {
    const t = transitioning ? progress.value : settled === 'expanded' ? 1 : 0;
    const inset = interpolate(t, [0, 1], [20, 32], 'clamp');
    return {
      bottom: 20 + interpolate(t, [0, 1], [0, bottomTravel], 'clamp'),
      left: inset,
      right: inset,
    };
  });
  return (
    <Animated.View style={[styles.panel, panelStyle]}>
      <Animated.View
        pointerEvents={
          !transitioning && settled === 'collapsed' ? 'auto' : 'none'
        }
        style={[
          styles.panelContent,
          { width: fromWidth, height: fromHeight },
          collapsedPosition,
          collapsedStyle,
        ]}
      >
        {children}
      </Animated.View>
      <Animated.View
        pointerEvents={
          !transitioning && settled === 'expanded' ? 'auto' : 'none'
        }
        style={[
          styles.panelContent,
          { width: toWidth, height: toHeight },
          expandedPosition,
          expandedStyle,
        ]}
      >
        <ExistingWalletContent
          onBack={onBack}
          bottomSpacing={bottomTravel + 20}
        />
      </Animated.View>
      <Animated.View
        style={[styles.persistentOptions, styles.options, optionsStyle]}
      >
        {newOptions.map((option, index) => (
          <WalletOption
            key={option.title}
            index={index}
            onPress={actions[index]!}
          />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

function ExistingWalletContent({
  onBack,
  bottomSpacing,
}: {
  onBack: () => void;
  bottomSpacing: number;
}) {
  const goBack = onBack;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { progress, transitioning, settled } = useSharedElementPresentation();
  const reduceMotion = useReducedMotion();
  const wiggle = useSharedValue(1);
  useAnimatedReaction(
    () => ({
      finishing: transitioning && progress.value >= 0.85,
      settled: !transitioning,
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
    [transitioning, reduceMotion, progress, wiggle]
  );
  useEffect(() => () => cancelAnimation(wiggle), [wiggle]);
  const artworkHeight = Math.max(88, Math.min(176, height * 0.2));
  const heroMotion = useAnimatedStyle(() => {
    const t = transitioning ? progress.value : settled === 'expanded' ? 1 : 0;
    return {
      transformOrigin: '50% 100%',
      transform: [{ scale: interpolate(t, [0.18, 1], [0.05, 1], 'clamp') }],
    };
  });

  return (
    <View style={styles.modalScreen}>
      <View style={{ paddingTop: insets.top }}>
        <View>
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
        </View>
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.expandedContent,
          { paddingBottom: bottomSpacing },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View>
          <Animated.View style={[styles.hero, heroMotion]}>
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
          </Animated.View>
        </View>
        <View style={styles.optionsPlaceholder} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  modalScreen: { flex: 1 },
  panel: { overflow: 'hidden' },
  panelContent: { position: 'absolute', left: 0, bottom: 0 },
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
  sheetContent: { flexGrow: 1, padding: 20, paddingTop: 8 },
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
  optionsPlaceholder: { height: 336, marginTop: 'auto' },
  persistentOptions: { position: 'absolute' },
  persistentOption: { height: 104, borderWidth: 1, borderStyle: 'dashed' },
  iconLayer: { position: 'absolute' },
  copyLayer: { position: 'absolute', left: 0, right: 0, gap: 5 },
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
  optionCopy: { flex: 1, height: 64, justifyContent: 'center' },
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
  expandedOptions: { marginTop: 'auto', paddingHorizontal: 32, paddingTop: 8 },
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

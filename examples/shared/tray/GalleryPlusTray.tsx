import type {
  createTrayNavigator as createExpoTrayNavigator,
  TrayHeaderProps as ExpoTrayHeaderProps,
} from 'react-native-screen-choreography/expo-router/tray';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  type createTrayNavigator,
  type TrayHeaderProps,
  type TrayScreenProps,
} from 'react-native-screen-choreography/tray';
import { AppIcon } from '../AppChrome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DemoTrayHeader, trayTheme } from './TrayChrome';
import { TrayLauncher } from './TrayLauncher';
import { useTrayExampleObservation } from './observation';
import { GalleryPlusButton } from './GalleryPlusButton';
import { GalleryPlusHero } from './GalleryPlusHero';

const plans = {
  annual: {
    title: 'Yearly',
    price: '$29.99',
    period: '/ year',
    detail: '$2.50 / month, billed yearly',
  },
  monthly: {
    title: 'Monthly',
    price: '$3.99',
    period: '/ month',
    detail: 'Billed monthly',
  },
} as const;
type Plan = keyof typeof plans;
export type GalleryTrayRoutes = {
  intro: undefined;
  plans: undefined;
  details: undefined;
  preview: { plan: Plan };
};

const benefits = [
  {
    icon: 'camera',
    title: 'Keep every detail',
    description: 'Original quality, from first light to last.',
    detail:
      'Keep full-resolution photos together with your camera settings, locations, and field notes.',
  },
  {
    icon: 'cloud',
    title: 'Take your journal anywhere',
    description: 'Your favorite places, always with you.',
    detail:
      'Bring your collections along for the journey, with offline access to the moments you have saved.',
  },
  {
    icon: 'share',
    title: 'Make a collection of it',
    description: 'Turn a few good moments into a story.',
    detail:
      'Organize photos into personal collections and share a considered selection with friends.',
  },
] as const;

function Header({
  title,
  canGoBack,
  navigation,
  dismiss,
  color,
}: TrayHeaderProps | ExpoTrayHeaderProps) {
  return (
    <DemoTrayHeader
      eyebrow="GALLERY"
      title={title}
      color={color}
      onBack={canGoBack ? navigation.goBack : undefined}
      onClose={dismiss}
    />
  );
}

export function Intro({
  navigation,
}: TrayScreenProps<GalleryTrayRoutes, 'intro'>) {
  useTrayExampleObservation('intro');
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.introCaption}>
        <View style={styles.dot} />
        <Text style={styles.secondary}>More space. More possibilities.</Text>
      </View>
      <GalleryPlusButton
        title="Explore Plus"
        onPress={() => navigation.push('plans')}
      />
    </ScrollView>
  );
}

export function Plans({
  navigation,
}: TrayScreenProps<GalleryTrayRoutes, 'plans'>) {
  const observation = useTrayExampleObservation('plans');
  const [selected, setSelected] = useState<Plan>('annual');
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      onMomentumScrollEnd={
        observation?.scrollEnd
          ? () => observation.scrollEnd?.('plans')
          : undefined
      }
    >
      <View style={styles.benefits}>
        {benefits.map((benefit) => (
          <View key={benefit.title} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <AppIcon name={benefit.icon} size={20} color={trayTheme.accent} />
            </View>
            <View style={styles.grow}>
              <Text style={styles.benefitTitle}>{benefit.title}</Text>
              <Text style={styles.secondary}>{benefit.description}</Text>
            </View>
          </View>
        ))}
      </View>
      <View
        style={styles.plans}
        accessibilityRole="radiogroup"
        accessibilityLabel="Choose a plan"
      >
        {(['monthly', 'annual'] as const).map((key) => {
          const plan = plans[key];
          const checked = selected === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              accessibilityLabel={`${plan.title}, ${plan.price} ${plan.period}${key === 'annual' ? ', save 37 percent' : ''}`}
              onPress={() => setSelected(key)}
              style={({ pressed }) => [
                styles.plan,
                checked && styles.selectedPlan,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.planHeading}>
                <Text style={styles.planTitle}>{plan.title}</Text>
                <View style={[styles.radio, checked && styles.checkedRadio]}>
                  {checked && <View style={styles.radioDot} />}
                </View>
              </View>
              <Text style={styles.price}>{plan.price}</Text>
              <Text style={styles.secondary}>{plan.period}</Text>
              <Text
                style={[styles.planNote, key === 'annual' && styles.saving]}
              >
                {key === 'annual' ? 'SAVE 37%' : 'KEEP IT FLEXIBLE'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Good to know"
        onPress={() => navigation.push('details')}
        style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}
      >
        <Text style={styles.secondary}>Good to know</Text>
        <AppIcon name="help" size={15} color={trayTheme.muted} />
      </Pressable>
      <GalleryPlusButton
        title="Preview Plus"
        onPress={() => navigation.push('preview', { plan: selected })}
      />
    </ScrollView>
  );
}

export function Details() {
  useTrayExampleObservation('details');
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
    >
      <Text accessibilityRole="header" style={styles.pageTitle}>
        A home for your favorites.
      </Text>
      {benefits.map((benefit) => (
        <View key={benefit.title} style={styles.detail}>
          <Text style={styles.benefitTitle}>{benefit.title}</Text>
          <Text style={styles.paragraph}>{benefit.detail}</Text>
        </View>
      ))}
      <View style={styles.note}>
        <Text style={styles.benefitTitle}>Just exploring</Text>
        <Text style={styles.paragraph}>
          This is an example upgrade flow. Plans and features are illustrative;
          no purchase or account is created.
        </Text>
      </View>
    </ScrollView>
  );
}

export function Preview({
  navigation,
  route,
}: TrayScreenProps<GalleryTrayRoutes, 'preview'>) {
  const plan = plans[route.params.plan];
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.previewBadge}>
        <AppIcon name="camera" color={trayTheme.onAccent} size={32} />
      </View>
      <Text accessibilityRole="header" style={styles.pageTitle}>
        Room for more.
      </Text>
      <Text style={styles.paragraph}>
        Your Gallery Plus preview is ready. A few more possibilities for your
        next adventure.
      </Text>
      <View style={styles.summary}>
        <View style={styles.grow}>
          <Text style={styles.benefitTitle}>{plan.title} plan</Text>
          <Text style={styles.secondary}>{plan.detail}</Text>
        </View>
        <Text style={styles.summaryPrice}>{plan.price}</Text>
      </View>
      <GalleryPlusButton
        title="Done exploring"
        onPress={() => navigation.getParent()?.goBack()}
      />
    </ScrollView>
  );
}

export function useGalleryTrayOptions() {
  const insets = useSafeAreaInsets();
  return {
    topInset: insets.top + 12,
    bottomInset: insets.bottom,
    backgroundColor: trayTheme.background,
    textColor: trayTheme.text,
    handleVisible: false,
    renderContentHeader: (
      props: React.ComponentProps<typeof GalleryPlusHero>
    ) => <GalleryPlusHero {...props} />,
    renderHeader: (props: TrayHeaderProps | ExpoTrayHeaderProps) => (
      <Header {...props} />
    ),
    animation: { type: 'spring', stiffness: 300, damping: 30 },
  } as const;
}

export const galleryPages = {
  intro: { title: 'Your gallery', contentHeaderHeight: 260 },
  plans: { title: 'Choose your plan', contentHeaderHeight: 188 },
  details: { title: 'Good to know' },
  preview: { title: 'Your preview' },
} as const;

export function makeGalleryTray(
  createNavigator: typeof createTrayNavigator | typeof createExpoTrayNavigator
) {
  const Tray = createNavigator<GalleryTrayRoutes>();
  return function GalleryTray() {
    const options = useGalleryTrayOptions();
    return (
      <Tray.Navigator {...options}>
        <Tray.Screen
          name="intro"
          component={Intro}
          options={galleryPages.intro}
        />
        <Tray.Screen
          name="plans"
          component={Plans}
          options={galleryPages.plans}
        />
        <Tray.Screen
          name="details"
          component={Details}
          options={galleryPages.details}
        />
        <Tray.Screen
          name="preview"
          component={Preview}
          options={galleryPages.preview}
        />
      </Tray.Navigator>
    );
  };
}

export function GalleryPlusTrayLauncher({ onPress }: { onPress: () => void }) {
  return (
    <TrayLauncher
      title="Gallery dynamic tray"
      subtitle="A little tray. More possibilities."
      icon="camera"
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 24 },
  introCaption: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: trayTheme.accent,
  },
  secondary: {
    fontSize: 12,
    lineHeight: 18,
    color: trayTheme.muted,
  },
  grow: { flex: 1, gap: 4 },
  benefits: { gap: 18, paddingTop: 12, paddingBottom: 24 },
  benefit: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  benefitIcon: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitTitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    color: trayTheme.text,
  },
  plans: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  plan: {
    flex: 1,
    padding: 14,
    borderRadius: trayTheme.radius,
    borderWidth: 1,
    borderColor: trayTheme.border,
    backgroundColor: trayTheme.surface,
  },
  selectedPlan: {
    borderColor: trayTheme.accent,
    backgroundColor: trayTheme.accentSoft,
  },
  planHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 12,
  },
  planTitle: {
    color: trayTheme.text,
    fontSize: 13,
    fontWeight: '500',
  },
  radio: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: trayTheme.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkedRadio: { borderColor: trayTheme.accent },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: trayTheme.accent,
  },
  price: {
    color: trayTheme.text,
    fontSize: 24,
    letterSpacing: -1,
    marginBottom: 2,
  },
  planNote: {
    color: trayTheme.muted,
    fontSize: 11,
    letterSpacing: 0,
    marginTop: 14,
  },
  saving: { color: trayTheme.accent },
  textButton: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  pageTitle: {
    color: trayTheme.text,
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 36,
    letterSpacing: -0.7,
    marginTop: 16,
    marginBottom: 10,
  },
  paragraph: {
    color: trayTheme.muted,
    fontSize: 14,
    lineHeight: 23,
  },
  detail: {
    gap: 6,
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: trayTheme.border,
  },
  note: {
    gap: 6,
    marginTop: 20,
    padding: 16,
    backgroundColor: trayTheme.surfaceRaised,
    borderRadius: trayTheme.radius,
  },
  previewBadge: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: trayTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 22,
    marginVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: trayTheme.border,
  },
  summaryPrice: {
    color: trayTheme.accent,
    fontSize: 22,
  },
  pressed: { opacity: 0.55 },
});

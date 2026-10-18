import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createTray,
  type TrayScreenProps,
} from 'react-native-screen-choreography/tray';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  SharedElement,
  makeTransition,
  TransitionFrame,
  useSharedElementPresentation,
  type TransitionRendererProps,
} from 'react-native-screen-choreography/core';
import { useSafeAreaInsets } from '../runtime';
import { AppIcon } from '../AppChrome';

type Routes = {
  actions: undefined;
  send: undefined;
  recipient: { amount: string; note: string };
  review: { amount: string; note: string; person: string };
  success: { person: string };
  settings: undefined;
};
const Tray = createTray<Routes>();
const ink = '#f4f5f7';
const muted = '#969aa5';
const accent = '#c8f79d';

function Action({
  title,
  subtitle,
  symbol,
  avatar,
  onPress,
}: {
  title: string;
  subtitle: string;
  symbol: string;
  avatar?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      {avatar ?? (
        <View style={styles.symbol}>
          <Text style={styles.symbolText}>{symbol}</Text>
        </View>
      )}
      <View style={styles.grow}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}
function Button({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
function Actions({ tray }: TrayScreenProps<Routes, 'actions'>) {
  return (
    <View style={styles.body}>
      <View style={styles.balance}>
        <Text style={styles.muted}>AVAILABLE BALANCE</Text>
        <Text style={styles.amount}>$2,480.00</Text>
        <Text style={styles.balanceHint}>
          A little room for something good.
        </Text>
      </View>
      <Action
        symbol="↗"
        title="Send money"
        subtitle="Make someone's day"
        onPress={() => tray.push('send')}
      />
      <Action
        symbol="☷"
        title="Preferences"
        subtitle="Make this space yours"
        onPress={() => tray.push('settings')}
      />
    </View>
  );
}
function Send({ tray }: TrayScreenProps<Routes, 'send'>) {
  const [amount, setAmount] = useState('25');
  const [note, setNote] = useState('Coffee on me');
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.body}
    >
      <Text style={styles.label}>AMOUNT</Text>
      <View style={styles.amountField}>
        <Text style={styles.currency}>$</Text>
        <TextInput
          accessibilityLabel="Amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          style={styles.amountInput}
          selectTextOnFocus
        />
      </View>
      <Text style={styles.label}>ADD A NOTE</Text>
      <TextInput
        accessibilityLabel="Payment note"
        value={note}
        onChangeText={setNote}
        placeholder="What's it for?"
        placeholderTextColor={muted}
        style={styles.input}
        returnKeyType="done"
      />
      <Text style={styles.hint}>Your draft stays here when you go back.</Text>
      <Button
        title="Choose recipient"
        disabled={!Number(amount) || Number(amount) < 0}
        onPress={() => tray.push('recipient', { amount, note })}
      />
    </ScrollView>
  );
}
const people = [
  'Alex Morgan',
  'Sam Rivera',
  'Jamie Park',
  'Taylor Chen',
  'Jordan Lee',
  'Casey James',
  'Riley Brooks',
  'Avery Scott',
  'Morgan Quinn',
  'Charlie Lane',
  'Robin Ellis',
  'Drew Carter',
];

function AvatarTransition({
  source,
  target,
  progress,
  direction,
  children,
  zIndex,
}: TransitionRendererProps) {
  const arc = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          -24 * Math.sin(Math.PI * Math.max(0, Math.min(1, progress.value))),
      },
    ],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, arc]} pointerEvents="none">
      <TransitionFrame
        sourceMetrics={source.metrics}
        targetMetrics={target.metrics}
        progress={progress}
        direction={direction}
        zIndex={zIndex}
      >
        {children}
      </TransitionFrame>
    </Animated.View>
  );
}
const avatarTransition = makeTransition({ renderer: AvatarTransition });
const recipientGroup = (person: string) => `recipient:${person}`;

function RecipientAvatar({ person }: { person: string }) {
  const { presentationProgress } = useSharedElementPresentation();
  const frame = useAnimatedStyle(() => ({
    borderRadius: 15 + 13 * presentationProgress.value,
  }));
  const letters = useAnimatedStyle(() => ({
    fontSize: 19 + 13 * presentationProgress.value,
  }));
  return (
    <Animated.View style={[styles.avatar, frame]}>
      <Animated.Text style={[styles.symbolText, letters]}>
        {person
          .split(' ')
          .map((part) => part[0])
          .join('')}
      </Animated.Text>
    </Animated.View>
  );
}

function Recipient({ tray, route }: TrayScreenProps<Routes, 'recipient'>) {
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionLabel}>YOUR PEOPLE</Text>
      {people.map((person, i) => (
        <Action
          key={person}
          avatar={
            <SharedElement
              id="avatar"
              groupId={recipientGroup(person)}
              transition={avatarTransition}
              style={styles.avatarSource}
            >
              <RecipientAvatar person={person} />
            </SharedElement>
          }
          symbol={person
            .split(' ')
            .map((p) => p[0])
            .join('')}
          title={person}
          subtitle={i < 3 ? 'Recent recipient' : 'In your contacts'}
          onPress={() =>
            tray.push(
              'review',
              { ...route.params, person },
              { groupId: recipientGroup(person) }
            )
          }
        />
      ))}
    </ScrollView>
  );
}
function Review({ tray, route }: TrayScreenProps<Routes, 'review'>) {
  return (
    <View style={styles.body}>
      <View style={styles.balance}>
        <SharedElement.Target
          id="avatar"
          groupId={recipientGroup(route.params.person)}
          transition={avatarTransition}
          style={styles.avatarTarget}
        />
        <Text style={styles.amount}>${route.params.amount}</Text>
        <Text style={styles.actionTitle}>To {route.params.person}</Text>
        <Text style={styles.balanceHint}>
          {route.params.note || 'A little something for you'}
        </Text>
      </View>
      <View style={styles.detail}>
        <Text style={styles.muted}>Transfer fee</Text>
        <Text style={styles.actionTitle}>Free</Text>
      </View>
      <Button
        title="Send demo payment"
        onPress={() => tray.replace('success', { person: route.params.person })}
      />
    </View>
  );
}
function Success({ tray, route }: TrayScreenProps<Routes, 'success'>) {
  return (
    <View style={styles.body}>
      <View style={styles.balance}>
        <View style={styles.largeSymbol}>
          <Text style={styles.largeSymbolText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>All good.</Text>
        <Text style={styles.balanceHint}>
          Your demo payment to {route.params.person} is complete.
        </Text>
      </View>
      <Button title="Back to wallet" onPress={tray.popToRoot} />
    </View>
  );
}
function Settings() {
  const [notifications, setNotifications] = useState(true);
  const [roundUp, setRoundUp] = useState(false);
  return (
    <View style={styles.body}>
      <View style={styles.detail}>
        <View style={styles.grow}>
          <Text style={styles.actionTitle}>Payment updates</Text>
          <Text style={styles.muted}>A heads-up when money arrives</Text>
        </View>
        <Switch
          accessibilityLabel="Payment updates"
          value={notifications}
          onValueChange={setNotifications}
          trackColor={{ true: accent }}
        />
      </View>
      <View style={styles.detail}>
        <View style={styles.grow}>
          <Text style={styles.actionTitle}>Round up</Text>
          <Text style={styles.muted}>Save a little with every purchase</Text>
        </View>
        <Switch
          accessibilityLabel="Round up"
          value={roundUp}
          onValueChange={setRoundUp}
          trackColor={{ true: accent }}
        />
      </View>
      <Text style={styles.hint}>
        Changes stay with this view until the tray closes.
      </Text>
    </View>
  );
}
export function TrayDemoProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Tray.Provider>
      {children}
      <Tray.Stack
        topInset={insets.top + 12}
        bottomInset={insets.bottom}
        backgroundColor="#23252b"
        textColor={ink}
        renderBackIcon={({ size }) => (
          <AppIcon name="back" color={ink} size={size} />
        )}
        renderCloseIcon={({ size }) => (
          <AppIcon name="close" color={ink} size={size} />
        )}
        animation={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <Tray.Screen
          name="actions"
          component={Actions}
          options={{ title: 'Your wallet' }}
        />
        <Tray.Screen
          name="send"
          component={Send}
          options={{ title: 'Send money' }}
        />
        <Tray.Screen
          name="recipient"
          component={Recipient}
          options={{ title: 'Choose recipient', presentation: 'fullScreen' }}
        />
        <Tray.Screen
          name="review"
          component={Review}
          options={{ title: 'Review payment' }}
        />
        <Tray.Screen
          name="success"
          component={Success}
          options={{ title: 'Payment sent' }}
        />
        <Tray.Screen
          name="settings"
          component={Settings}
          options={{ title: 'Preferences' }}
        />
      </Tray.Stack>
    </Tray.Provider>
  );
}

export function TrayDemoLauncher() {
  const tray = Tray.useTray();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dynamic tray"
      onPress={() => tray.present('actions')}
      style={({ pressed }) => [styles.launcher, pressed && styles.pressed]}
    >
      <View style={styles.launcherIcon}>
        <Text style={styles.symbolText}>↗</Text>
      </View>
      <View style={styles.grow}>
        <Text style={styles.launcherTitle}>Dynamic tray</Text>
        <Text style={styles.muted}>A wallet that moves with you</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 22, paddingBottom: 24 },
  grow: { flex: 1, gap: 5 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ffffff12',
  },
  actionTitle: { color: ink, fontSize: 16, fontWeight: '500' },
  muted: { color: muted, fontSize: 12 },
  symbol: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#33373b',
  },
  avatar: {
    width: '100%',
    height: '100%',
    backgroundColor: '#33373b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSource: { width: 42, height: 42 },
  avatarTarget: { width: 72, height: 72 },
  symbolText: { color: accent, fontSize: 19, fontWeight: '600' },
  chevron: { fontSize: 26, color: muted },
  balance: { alignItems: 'center', paddingTop: 18, paddingBottom: 28, gap: 10 },
  amount: { color: ink, fontSize: 42, fontWeight: '600', letterSpacing: -1.5 },
  balanceHint: {
    color: muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  button: {
    backgroundColor: accent,
    minHeight: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#24331c', fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.55 },
  label: {
    color: muted,
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  amountField: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currency: { color: muted, fontSize: 42 },
  amountInput: {
    color: ink,
    fontSize: 48,
    fontWeight: '500',
    flex: 1,
    padding: 0,
  },
  input: {
    borderRadius: 14,
    backgroundColor: '#30333b',
    color: ink,
    fontSize: 16,
    padding: 16,
  },
  hint: {
    color: muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 18,
    marginBottom: 4,
  },
  footnote: {
    color: muted,
    fontSize: 9,
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 24,
  },
  sectionLabel: {
    color: muted,
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  largeSymbol: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#c8f79d18',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  largeSymbolText: { color: accent, fontSize: 38 },
  detail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
  },
  successTitle: { color: ink, fontSize: 32, fontWeight: '600' },
  launcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 24,
    marginTop: 24,
    padding: 18,
    backgroundColor: '#23252b',
    borderRadius: 24,
  },
  launcherIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c8f79d16',
    borderRadius: 16,
  },
  launcherTitle: { color: ink, fontSize: 18, fontWeight: '600' },
});

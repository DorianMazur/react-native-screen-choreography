import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChoreographyOverlay } from 'react-native-screen-choreography/core';
import { theme } from '../theme';
import { createJSLoadController } from './jsThreadLoad';

export function JSStressMenu() {
  const insets = useSafeAreaInsets();
  const [controller] = useState(createJSLoadController);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot
  );
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') controller.stop();
    });
    return () => {
      subscription.remove();
      controller.dispose();
    };
  }, [controller]);
  const choose = (action: () => void) => {
    setVisible(false);
    action();
  };
  return (
    <ChoreographyOverlay>
      <View
        pointerEvents="box-none"
        style={[styles.launcher, { bottom: Math.max(insets.bottom, 12) }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`JS stress menu. ${state.label}`}
          testID="js-stress-menu"
          onPress={() => setVisible(true)}
          style={[styles.badge, state.phase !== 'idle' && styles.badgeActive]}
        >
          <Text style={styles.badgeText}>
            {state.phase === 'idle' ? 'JS stress' : state.label}
          </Text>
        </Pressable>
      </View>
      <Modal
        transparent
        visible={visible}
        animationType="none"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.backdrop}>
          <View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
            <ScrollView>
              <Text accessibilityRole="header" style={styles.title}>
                JavaScript stress test
              </Text>
              <Text style={styles.description}>
                Add CPU work to the JS thread, then open or close a demo. Native
                animation can continue while JS taps and callbacks wait.
              </Text>
              <Text testID="js-stress-status" style={styles.status}>
                {state.label}
              </Text>
              <Action
                id="js-stress-heavy"
                title="Heavy load · 30 s"
                detail="80 ms busy, then at least 20 ms free."
                onPress={() => choose(() => controller.pulse('heavy'))}
              />
              <Action
                id="js-stress-super-heavy"
                title="Super heavy load · 30 s"
                detail="500 ms busy, then at least 20 ms free."
                onPress={() => choose(() => controller.pulse('superHeavy'))}
              />
              <Text style={styles.description}>
                Synthetic JS load only; this does not simulate GPU or native
                UI-thread load. Stops automatically in the background. Stop
                responds when the current busy interval finishes.
              </Text>
              <Action
                id="js-stress-stop"
                title="Stop JS load"
                onPress={() => choose(controller.stop)}
              />
              <Action
                id="js-stress-close"
                title="Close"
                onPress={() => setVisible(false)}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ChoreographyOverlay>
  );
}

function Action({
  id,
  title,
  detail,
  onPress,
}: {
  id: string;
  title: string;
  detail?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Text style={styles.actionTitle}>{title}</Text>
      {detail && <Text style={styles.description}>{detail}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  launcher: { position: 'absolute', right: 12, zIndex: 1000 },
  badge: {
    backgroundColor: theme.surface,
    borderColor: theme.borderStrong,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  badgeActive: { borderColor: theme.warn },
  badgeText: { fontSize: 11, fontFamily: theme.numbers, color: theme.text },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#00000088',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: theme.bgElevated,
    padding: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  title: {
    color: theme.text,
    fontSize: 23,
    fontWeight: '600',
    marginBottom: 12,
  },
  description: { color: theme.textSecondary, fontSize: 13, lineHeight: 19 },
  status: { color: theme.warn, fontSize: 13, marginVertical: 16 },
  action: { paddingVertical: 14, borderTopWidth: 1, borderColor: theme.border },
  actionTitle: { color: theme.text, fontSize: 16, marginBottom: 4 },
  pressed: { opacity: 0.6 },
});

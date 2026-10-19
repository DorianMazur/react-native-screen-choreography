import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  SafeAreaView,
  useChoreographyControls,
  useSharedElementPresentation,
  useExampleNavigation,
  useSafeAreaInsets,
} from '../runtime';
import { AppIcon, ScreenHeader } from '../AppChrome';
import { theme } from '../theme';
import { usePullToDismiss } from '../usePullToDismiss';
import {
  journalFrame,
  journalGroup,
  journalOpacities,
} from './journalGeometry';
import { journalTransition } from './journalTransition';

const COLLECTIONS = [
  {
    id: 'trails',
    name: 'Trails',
    icon: 'external',
    color: '#D9C49B',
    description: 'Take the slower path.',
    prompt:
      'A bend in the path, a new landmark, a place to pause. Notice one thing you would usually walk past.',
    category: 'WALKS & WANDERINGS',
  },
  {
    id: 'sky',
    name: 'Sky',
    icon: 'cloud',
    color: '#B8CEDF',
    description: 'Look a little higher.',
    prompt:
      'Watch the light change. Collect cloud shapes, passing weather, and the colors just before sunset.',
    category: 'LIGHT & WEATHER',
  },
  {
    id: 'street',
    name: 'Street',
    icon: 'camera',
    color: '#DEB5A6',
    description: 'Find a new angle.',
    prompt:
      'A painted doorway, a reflection, a familiar corner. Keep a small detail from your everyday route.',
    category: 'EVERYDAY DETAILS',
  },
  {
    id: 'botanical',
    name: 'Botanical',
    icon: 'plus',
    color: '#B9CBA7',
    description: 'Follow what grows.',
    prompt:
      'Look for a new leaf or a flower opening. Record the small changes that happen between visits.',
    category: 'LEAVES & BLOOMS',
  },
  {
    id: 'wildlife',
    name: 'Wildlife',
    icon: 'eye',
    color: '#C6BED9',
    description: 'Stay still. Notice more.',
    prompt:
      'Listen for a bird, follow a tiny trail, or watch who visits the garden. Give the moment your attention.',
    category: 'SMALL ENCOUNTERS',
  },
  {
    id: 'seasons',
    name: 'Seasons',
    icon: 'restore',
    color: '#D7B3B6',
    description: 'Come back and compare.',
    prompt:
      'Return to a favorite spot. Notice what has changed since your last visit and what has stayed the same.',
    category: 'CHANGE OVER TIME',
  },
] as const;
type Collection = (typeof COLLECTIONS)[number];

export function JournalScreen() {
  const { goBack, navigate } = useExampleNavigation();
  const openCollection = (collection: Collection) => {
    navigate(
      {
        screen: 'JournalDetail',
        params: { collectionId: collection.id },
      },
      {
        ...journalTransition.navigationOptions,
        transitionConfig: { group: journalGroup(collection.id) },
      }
    );
  };
  return (
    <SafeAreaView style={styles.home}>
      <StatusBar barStyle="light-content" />
      <ScreenHeader title="Field journal" onBack={() => goBack()} />
      <ScrollView contentContainerStyle={styles.homeContent}>
        <Text style={styles.eyebrow}>COLLECTIONS / FIELD NOTES</Text>
        <Text style={styles.title}>Small things, better noticed.</Text>
        <Text style={styles.secondary}>
          Choose a collection. Keep a little of the outside.
        </Text>
        <View style={styles.grid}>
          {COLLECTIONS.map((collection) => (
            <Pressable
              key={collection.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${collection.name}`}
              onPress={() => openCollection(collection)}
              style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
            >
              <CollectionStamp collection={collection} size={72} />
              <Text style={styles.collectionName}>{collection.name}</Text>
              <Text style={styles.category}>{collection.category}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CollectionStamp({
  collection,
  size,
}: {
  collection: Collection;
  size: number;
}) {
  return (
    <journalTransition.Element
      name="collection"
      groupId={journalGroup(collection.id)}
      style={{ width: size, height: size }}
    >
      <View
        style={[
          styles.artwork,
          {
            width: size,
            height: size,
            borderRadius: size / 4,
            backgroundColor: collection.color,
          },
        ]}
      >
        <View style={[styles.stampBorder, { borderRadius: size * 0.17 }]} />
        <AppIcon name={collection.icon} color={theme.ink} size={size * 0.42} />
      </View>
    </journalTransition.Element>
  );
}

export function JournalDetailScreen({
  collectionId = 'trails',
}: {
  collectionId?: string;
}) {
  const collection =
    COLLECTIONS.find((item) => item.id === collectionId) ?? COLLECTIONS[0];
  const groupId = journalGroup(collection.id);
  const { goBack } = useExampleNavigation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // Local content sizing only. Transition endpoints come from the library-owned presentation.
  const [viewport, setViewport] = useState({
    width: window.width,
    height: window.height,
  });
  const panHandlers = usePullToDismiss(groupId);
  const close = () => goBack(journalTransition.navigationOptions);
  return (
    <View
      style={styles.fill}
      onLayout={({ nativeEvent: { layout } }) =>
        setViewport((current) =>
          current.width === layout.width && current.height === layout.height
            ? current
            : { width: layout.width, height: layout.height }
        )
      }
    >
      <journalTransition.Element.Target
        name="collection"
        groupId={groupId}
        style={StyleSheet.absoluteFill}
        hostStyle={styles.hiddenHost}
      >
        <JournalContent collection={collection} viewport={viewport} />
      </journalTransition.Element.Target>
      {/* Route-owned controls remain reachable while the icon is in the overlay. */}
      <View
        {...panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Pull down to close collection"
        accessibilityHint="Drag a little and release to cancel, or drag farther to close."
        onAccessibilityTap={close}
        testID="journal-dismiss-handle"
        style={[styles.grabArea, { top: insets.top }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close collection"
        onPress={close}
        testID="journal-close"
        style={[styles.closeArea, { top: insets.top + 32 }]}
      />
    </View>
  );
}

function JournalContent({
  collection,
  viewport,
}: {
  collection: Collection;
  viewport: { width: number; height: number };
}) {
  const { collapsed, expanded, presentationProgress, frame } =
    useSharedElementPresentation();
  const { settleTransition } = useChoreographyControls();
  const insets = useSafeAreaInsets();
  const collapsedMetrics = collapsed.metrics;
  const expandedMetrics = expanded.metrics;
  const cardStyle = useAnimatedStyle(() => {
    if (!frame.value || !collapsedMetrics || !expandedMetrics) {
      return {
        opacity: 1,
        ...viewport,
        borderRadius: 0,
        transform: [{ translateX: 0 }, { translateY: 0 }],
      };
    }
    const mask = journalFrame(
      collapsedMetrics,
      expandedMetrics,
      presentationProgress.value
    );
    return {
      opacity: journalOpacities(presentationProgress.value).card,
      width: mask.width,
      height: mask.height,
      borderRadius: mask.radius,
      transform: [
        { translateX: mask.x - expandedMetrics.pageX },
        { translateY: mask.y - expandedMetrics.pageY },
      ],
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const mask =
      frame.value && collapsedMetrics && expandedMetrics
        ? journalFrame(
            collapsedMetrics,
            expandedMetrics,
            presentationProgress.value
          )
        : viewport;
    const scale = mask.width / viewport.width;
    return {
      transform: [
        { translateY: (mask.height - viewport.height * scale) / 2 },
        { scale },
      ],
    };
  });
  return (
    <Animated.View
      style={[styles.card, { backgroundColor: collection.color }, cardStyle]}
    >
      <Animated.View style={[styles.content, viewport, contentStyle]}>
        <View style={[styles.pageHeader, { paddingTop: insets.top + 12 }]}>
          <View style={styles.handle} />
          <View style={styles.toolbar}>
            <Text style={styles.pageEyebrow}>
              {collection.name.toUpperCase()}
            </Text>
            <AppIcon name="close" color={theme.ink} />
          </View>
        </View>
        <ObservationPage
          collection={collection}
          onInteract={settleTransition}
        />
      </Animated.View>
    </Animated.View>
  );
}

function ObservationPage({
  collection,
  onInteract,
}: {
  collection: Collection;
  onInteract: () => void;
}) {
  const [count, setCount] = useState(0);
  const [saved, setSaved] = useState(false);
  return (
    <ScrollView
      onScrollBeginDrag={onInteract}
      contentContainerStyle={styles.pageContent}
    >
      <View style={styles.largeIcon}>
        <AppIcon name={collection.icon} color={theme.ink} size={56} />
      </View>
      <Text style={styles.pageTitle}>{collection.description}</Text>
      <Text style={styles.pageBody}>{collection.prompt}</Text>
      <View style={styles.observationCard}>
        <Text style={styles.pageEyebrow}>OBSERVATIONS THIS VISIT</Text>
        <Text accessibilityLiveRegion="polite" style={styles.counter}>
          {count}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log an observation"
          onPress={() => {
            onInteract();
            setCount(count + 1);
          }}
          style={styles.action}
        >
          <AppIcon name="plus" color={collection.color} size={22} />
          <Text style={[styles.actionText, { color: collection.color }]}>
            Log an observation
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          saved ? 'Collection bookmarked' : 'Bookmark collection'
        }
        accessibilityState={{ selected: saved }}
        onPress={() => {
          onInteract();
          setSaved(!saved);
        }}
        style={styles.save}
      >
        <Text style={styles.pageEyebrow}>
          {saved ? 'COLLECTION BOOKMARKED' : 'BOOKMARK COLLECTION'}
        </Text>
        <AppIcon
          name={saved ? 'restore' : 'download'}
          color={theme.ink}
          size={20}
        />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  home: { flex: 1, backgroundColor: '#202937' },
  homeContent: { padding: 24, paddingBottom: 48 },
  eyebrow: {
    fontFamily: theme.numbers,
    fontSize: 10,
    color: '#B5C4D5',
    letterSpacing: 1.3,
  },
  title: {
    fontFamily: theme.font,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '600',
    color: theme.text,
    marginTop: 12,
    marginBottom: 10,
    maxWidth: 280,
  },
  secondary: {
    fontFamily: theme.font,
    fontSize: 13,
    lineHeight: 20,
    color: '#B5C0CF',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 24,
    marginTop: 32,
  },
  cell: { width: '50%', alignItems: 'flex-start', gap: 8 },
  category: {
    fontFamily: theme.numbers,
    fontSize: 8,
    letterSpacing: 0.6,
    color: '#B5C0CF',
  },
  stampBorder: {
    position: 'absolute',
    left: 5,
    right: 5,
    top: 5,
    bottom: 5,
    borderWidth: 1,
    borderColor: '#17220E44',
    borderStyle: 'dashed',
  },
  artwork: {
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  collectionName: {
    fontFamily: theme.font,
    fontSize: 14,
    color: theme.text,
    fontWeight: '500',
  },
  pressed: { opacity: 0.75 },
  hiddenHost: { opacity: 0, pointerEvents: 'none' },
  card: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  content: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'top left',
  },
  pageHeader: { paddingHorizontal: 28 },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: '#17220E55',
    borderRadius: 3,
    alignSelf: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    height: 32,
  },
  pageEyebrow: {
    fontFamily: theme.numbers,
    fontSize: 11,
    fontWeight: '600',
    color: theme.ink,
    letterSpacing: 1,
  },
  grabArea: { position: 'absolute', left: 72, right: 72, height: 32 },
  closeArea: { position: 'absolute', right: 16, width: 48, height: 48 },
  pageContent: { padding: 28, paddingBottom: 100 },
  largeIcon: { marginTop: 14, marginBottom: 26 },
  pageTitle: {
    fontFamily: theme.font,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '600',
    color: theme.ink,
    maxWidth: 320,
  },
  pageBody: {
    fontFamily: theme.font,
    fontSize: 16,
    lineHeight: 25,
    color: theme.ink,
    marginTop: 18,
  },
  observationCard: {
    backgroundColor: '#FFFFFF55',
    borderRadius: 24,
    padding: 24,
    marginTop: 30,
  },
  counter: {
    fontFamily: theme.font,
    fontSize: 70,
    color: theme.ink,
    fontWeight: '500',
    marginVertical: 12,
  },
  action: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: theme.ink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontFamily: theme.font, fontSize: 15, fontWeight: '600' },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 24,
  },
});

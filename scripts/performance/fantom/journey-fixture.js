/* global expect */
import * as Fantom from '@react-native/fantom';
import { createRef, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SCENARIOS } from '../../../examples/react-navigation/src/performance/scenarios';
import { ElementRegistry } from '../../../src/core/ElementRegistry';
import { ScreenReadinessRegistry } from '../../../src/core/ScreenReadinessRegistry';
import { NavigationSessionController } from '../../../src/core/NavigationSessionController';
import { TransitionCoordinator } from '../../../src/core/TransitionCoordinator';
import { makeMutable } from './reanimated-values';

// Geometry-only adaptations of the example screens. Plain Fabric Views replace
// images, text and portal payloads; native navigation and animation are absent.
// Keep the grid gutters/aspect ratio, carousel sizing and wallet row sizing in
// sync with examples/shared/{gallery,trips,wallet} when those layouts change.
const layouts = {
  gallery: {
    group: 'photo',
    endpoint: 'hero',
    items: ['aurora', 'dunes', 'coast', 'midnight', 'forest', 'rooftops'],
    list(width, index) {
      const tile = (width - 60) / 2;
      return {
        left: 24 + (index % 2) * (tile + 12),
        top: 160 + Math.floor(index / 2) * (tile / 0.72 + 12),
        width: tile,
        height: tile / 0.72,
      };
    },
    detail: (width) => ({ left: 0, top: 64, width, height: width }),
  },
  trips: {
    group: 'trip',
    endpoint: 'trip',
    items: ['seiland', 'mallorca'],
    list(width, index) {
      const card = Math.min(width - 76, 360);
      return {
        left: 24 + index * (card + 16),
        top: 160,
        width: card,
        height: 424,
      };
    },
    detail: (width) => ({ left: 0, top: 0, width, height: 800 }),
  },
  wallet: {
    group: 'token',
    endpoint: 'card',
    items: [
      'polygon',
      'ethereum',
      'bitcoin',
      'solana',
      'avalanche',
      'chainlink',
    ],
    list: (width, index) => ({
      left: 16,
      top: 220 + index * 102,
      width: width - 32,
      height: 92,
    }),
    detail: (width) => ({ left: 0, top: 0, width, height: 800 }),
  },
};

export const JOURNEYS = Object.entries(SCENARIOS).map(([id, scenario]) => ({
  id,
  ...scenario,
}));

function Endpoint({ record, registry, frame, children }) {
  useEffect(() => {
    registry.register(record);
    return () =>
      registry.unregister(record.id, record.screenId, record.groupId);
  }, [record, registry]);
  return (
    <View ref={record.ref} collapsable={false} style={[styles.absolute, frame]}>
      {children}
    </View>
  );
}

function Screen({ screenRef, screenId, readiness, children }) {
  useEffect(() => {
    readiness.setReady(screenId, true);
    return () => readiness.unregister(screenId);
  }, [readiness, screenId]);
  return (
    <View ref={screenRef} collapsable={false} style={StyleSheet.absoluteFill}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: { position: 'absolute' },
  screen: { height: 800 },
  header: { height: 120, padding: 24 },
  fill: { flex: 1 },
  payload: { flex: 1, padding: 12 },
  block: { height: 16, marginBottom: 8 },
  detailContent: { position: 'absolute', top: 720, left: 24 },
});

export function createJourneyFixture(scenario) {
  const layout = layouts[scenario.id];
  const selectedIndex = layout.items.indexOf(scenario.itemId);
  if (selectedIndex < 0)
    throw new Error('E2E scenario item is absent from the Fantom layout');
  const root = Fantom.createRoot({ viewportWidth: 420, viewportHeight: 800 });
  const registry = new ElementRegistry();
  const readiness = new ScreenReadinessRegistry();
  const listRef = createRef();
  const detailRef = createRef();
  const navigation = new NavigationSessionController();
  const progress = makeMutable(0);
  const coordinator = new TransitionCoordinator(registry, progress, {
    getScreenRef: (id) =>
      id === scenario.listScreen
        ? listRef
        : id === scenario.detailScreen
          ? detailRef
          : undefined,
    isScreenReady: (id) => readiness.isReady(id),
    waitsForAttachment: true,
  });
  // Renderers never run in this preparation-only harness.
  const transition = { renderer: () => null };
  let presentationRevision = 0;
  const record = (itemId, screenId) => ({
    id: layout.endpoint,
    groupId: `${layout.group}.${itemId}`,
    screenId,
    ref: createRef(),
    metrics: null,
    getPresentation: () => ({
      transition,
      metadata: { itemId, screenId, revision: presentationRevision },
    }),
  });
  const items = layout.items.map((id) => record(id, scenario.listScreen));
  const target = record(scenario.itemId, scenario.detailScreen);
  const group = target.groupId;
  let width = 420;
  let listOffset = 0;
  let mounted = false;
  let readyGeometry = true;
  let targetRegistered = true;
  let holdAttachment = false;
  let releaseReadiness;
  let pendingTarget = null;

  coordinator.setOnSessionChange((session) => {
    navigation.setActiveSession(session);
    if (session?.state === 'preparing' && !holdAttachment) {
      // Native attachment is a controlled boundary, not a measured platform cost.
      Fantom.scheduleTask(() => coordinator.acknowledgeAttachment(session.id));
    }
  });

  function renderTree() {
    root.render(
      <View style={[styles.screen, { width }]}>
        <Screen
          screenRef={listRef}
          screenId={scenario.listScreen}
          readiness={readiness}
        >
          <View style={styles.header}>
            <View style={styles.block} />
            <View style={styles.block} />
          </View>
          {items.map((item, index) => (
            <Endpoint
              key={item.groupId}
              record={item}
              registry={registry}
              frame={{
                ...layout.list(width, index),
                top: layout.list(width, index).top + listOffset,
              }}
            >
              <View style={styles.payload}>
                <View style={styles.fill} />
                <View style={styles.block} />
                <View style={styles.block} />
              </View>
            </Endpoint>
          ))}
        </Screen>
        {mounted && (
          <Screen
            screenRef={detailRef}
            screenId={scenario.detailScreen}
            readiness={readiness}
          >
            {targetRegistered && (
              <Endpoint
                record={target}
                registry={registry}
                frame={{
                  ...layout.detail(width),
                  ...(!readyGeometry && { height: 0 }),
                }}
              />
            )}
            {/* The destination has an empty receiver, never a second payload. */}
            <View style={[styles.detailContent, { width: width - 48 }]}>
              <View style={styles.block} />
              <View style={styles.block} />
            </View>
          </Screen>
        )}
      </View>
    );
  }

  function flush() {
    Fantom.runWorkLoop();
    root.takeMountingManagerLogs();
  }

  function render() {
    Fantom.scheduleTask(renderTree);
    flush();
  }

  function track(action) {
    const request = { settled: false, session: undefined, error: undefined };
    Fantom.scheduleTask(() => {
      action().then(
        (session) => {
          request.session = session;
          request.settled = true;
        },
        (error) => {
          request.error = error;
          request.settled = true;
        }
      );
    });
    flush();
    return request;
  }

  function present(sessionId) {
    return new Promise((resolve) => {
      Fantom.scheduleTask(() => {
        const session = coordinator.getActiveSession();
        const valid =
          session?.id === sessionId && session.presentation.validate();
        if (valid) session.presentation.phase.value = 2;
        resolve(Boolean(valid));
      });
    });
  }

  function finish() {
    const session = coordinator.getActiveSession();
    if (session) {
      // Explicit settlement substitutes animation completion; there is no spring.
      progress.value = session.direction === 'forward' ? 1 : 0;
      coordinator.completeTransition(session.id);
    }
    navigation.releaseNavigationLock();
  }

  render();
  return {
    registry,
    readiness,
    navigation,
    coordinator,
    progress,
    listSize: items.length,
    sourceRef: items[selectedIndex].ref,
    targetRef: target.ref,
    endpoint: layout.endpoint,
    group,
    pendingTarget: () => pendingTarget,
    expected(screen) {
      const frame =
        screen === 'list'
          ? layout.list(width, selectedIndex)
          : layout.detail(width);
      return {
        pageX: frame.left,
        pageY: frame.top + (screen === 'list' ? listOffset : 0),
        width: frame.width,
        height: frame.height,
      };
    },
    open({
      pendingLayout = false,
      pendingRegistration = false,
      pendingReadiness = false,
      pendingAttachment = false,
    } = {}) {
      readyGeometry = !pendingLayout;
      targetRegistered = !pendingRegistration;
      holdAttachment = pendingAttachment;
      if (!navigation.acquireNavigationLock(scenario.listScreen))
        throw new Error('Navigation is already locked');
      const lock = navigation.getNavigationLockToken();
      if (pendingReadiness)
        releaseReadiness = readiness.acquire(scenario.detailScreen);
      return track(() =>
        navigation.prepareForwardTransition({
          groupId: group,
          sourceScreenId: scenario.listScreen,
          targetScreenId: scenario.detailScreen,
          // The app also skips this fallback frame wait when Fabric capture exists.
          isAndroid: false,
          captureSourceGroup: (groupId, screenId) =>
            coordinator.captureSourceGroup(groupId, screenId),
          setPendingTargetScreen: (id) => {
            pendingTarget = id;
          },
          dispatchNavigation: () => {
            mounted = true;
            Fantom.scheduleTask(renderTree);
          },
          waitForScreenReady: (id) => readiness.waitForReady(id, 700),
          waitForNextFrame: () => {
            throw new Error('Unexpected fallback frame wait');
          },
          startTransition: (config) => coordinator.startTransition(config),
          waitForOverlayReady: present,
          isOverlayPresented: (id) =>
            coordinator.getActiveSession()?.id === id &&
            coordinator.getActiveSession().presentation.phase.value === 2,
          isPreparationCurrent: () =>
            navigation.isNavigationLocked() &&
            navigation.getNavigationLockToken() === lock,
          isSessionCurrent: (id) => navigation.isCurrentSession(id),
        })
      );
    },
    prepareBack() {
      finish();
      holdAttachment = false;
      navigation.acquireNavigationLock(scenario.detailScreen);
      return track(async () => {
        const session = await coordinator.startTransition({
          groupId: group,
          sourceScreenId: scenario.detailScreen,
          targetScreenId: scenario.listScreen,
          direction: 'backward',
        });
        if (session) await present(session.id);
        return session;
      });
    },
    finish,
    acknowledgeAttachment(id = coordinator.getActiveSession()?.id) {
      Fantom.scheduleTask(() => coordinator.acknowledgeAttachment(id));
      flush();
    },
    finishRegistration() {
      targetRegistered = true;
      render();
    },
    finishReadiness() {
      Fantom.scheduleTask(() => releaseReadiness?.());
      flush();
    },
    finishLayout() {
      readyGeometry = true;
      render();
    },
    relayout(nextWidth, offset) {
      width = nextWidth;
      listOffset = offset;
      presentationRevision++;
      render();
    },
    dismiss() {
      Fantom.runTask(() => {
        coordinator.cancelTransition();
        navigation.releaseNavigationLock();
        pendingTarget = null;
        mounted = false;
        renderTree();
      });
      flush();
    },
    destroy() {
      coordinator.dispose();
      navigation.releaseNavigationLock();
      root.destroy();
      readiness.dispose();
      registry.clear();
      flush();
    },
  };
}

export function expectJourneySession(fixture, request, direction) {
  expect(request.error).toBe(undefined);
  expect(request.settled).toBe(true);
  const session = request.session;
  expect(session.direction).toBe(direction);
  expect(session.state).toBe('active');
  expect(session.pairs).toHaveLength(1);
  const pair = session.pairs[0];
  expect(pair.id).toBe(fixture.endpoint);
  expect(pair.source.groupId).toBe(fixture.group);
  expect(pair.target.groupId).toBe(fixture.group);
  for (const side of ['source', 'target']) {
    const screen =
      (side === 'source') === (direction === 'forward') ? 'list' : 'detail';
    for (const [key, value] of Object.entries(fixture.expected(screen))) {
      expect(pair[`${side}Metrics`][key]).toBeCloseTo(value, 0);
    }
  }
}

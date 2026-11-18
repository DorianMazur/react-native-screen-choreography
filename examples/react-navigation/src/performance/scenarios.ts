export const SCREEN_SCENARIOS = {
  gallery: {
    label: 'Gallery',
    itemId: 'aurora',
    listScreen: 'GalleryList',
    detailScreen: 'GalleryDetail',
    workload: 'gallery-aurora-native-touch-roundtrip-v1',
  },
  trips: {
    label: 'Trips',
    itemId: 'seiland',
    listScreen: 'TripsList',
    detailScreen: 'TripsDetail',
    workload: 'trips-seiland-native-touch-roundtrip-v1',
  },
  wallet: {
    label: 'Wallet',
    itemId: 'polygon',
    listScreen: 'TokenList',
    detailScreen: 'TokenDetail',
    workload: 'wallet-polygon-native-touch-roundtrip-v1',
  },
} as const;

export const TRAY_SCENARIOS = {
  'tray-wallet': {
    label: 'Wallet tray',
    workload: 'tray-wallet-send-recipient-review-native-touch-cycle-v1',
    source: 'recipient',
    target: 'review',
    routes: [
      'actions',
      'send',
      'recipient',
      'review',
      'recipient',
      'send',
      'actions',
      'closed',
    ],
    controls: [
      'Wallet dynamic tray',
      'Send money',
      'Choose recipient',
      'Alex Morgan',
      'Back in tray',
      'Back in tray',
      'Back in tray',
      'Close tray',
    ],
  },
  'tray-gallery': {
    label: 'Gallery tray',
    workload: 'tray-gallery-plans-details-native-touch-cycle-v1',
    source: 'intro',
    target: 'plans',
    routes: ['intro', 'plans', 'details', 'plans', 'intro', 'closed'],
    controls: [
      'Gallery dynamic tray',
      'Explore Plus',
      'Good to know',
      'Back in tray',
      'Back in tray',
      'Close tray',
    ],
  },
} as const;

export const SCENARIOS = { ...SCREEN_SCENARIOS, ...TRAY_SCENARIOS };
export type ScreenPerformanceScenario = keyof typeof SCREEN_SCENARIOS;
export type TrayPerformanceScenario = keyof typeof TRAY_SCENARIOS;
export type PerformanceScenario = keyof typeof SCENARIOS;
export const SCENARIO_IDS = Object.keys(
  SCREEN_SCENARIOS
) as ScreenPerformanceScenario[];
export const PERFORMANCE_SCENARIO_IDS = Object.keys(
  SCENARIOS
) as PerformanceScenario[];

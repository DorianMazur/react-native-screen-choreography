export const SCENARIOS = {
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

export type PerformanceScenario = keyof typeof SCENARIOS;
export const SCENARIO_IDS = Object.keys(SCENARIOS) as PerformanceScenario[];

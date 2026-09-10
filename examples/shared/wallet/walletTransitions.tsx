import { defineTransition } from '../runtime';

export const walletTransition = defineTransition({
  shared: {
    icon: { kind: 'bounds' },
    name: { kind: 'bounds' },
    symbol: { kind: 'bounds' },
    value: { kind: 'bounds' },
    change: { kind: 'bounds' },
  },
  enter: {
    period: { during: [0.8, 0.95] },
    history: { during: [0.4, 0.95] },
    holdings: { during: [0.72, 0.95], translateY: 10 },
  },
});

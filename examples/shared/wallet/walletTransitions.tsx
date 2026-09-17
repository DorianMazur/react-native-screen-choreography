import { defineTransition } from '../runtime';

export const walletTransition = defineTransition({
  motion: { spring: { duration: 650, dampingRatio: 1 } },
  shared: {
    card: { kind: 'bounds', radius: [16, 0] },
  },
});

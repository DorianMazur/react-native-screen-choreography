import { defineTransition } from '../runtime';

// The panel owns its controls, artwork, and endpoint-aware layout throughout.
export const walletSetupTransition = defineTransition({
  shared: { panel: { kind: 'bounds', zIndex: 0 } },
});

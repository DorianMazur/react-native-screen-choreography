import { Platform } from 'react-native';

export const theme = {
  bg: '#101211',
  bgElevated: '#151816',
  surface: '#191C1A',
  surfaceElevated: '#242A26',
  surfaceMuted: '#131614',
  border: '#2C312E',
  borderStrong: '#465149',

  text: '#F4F6F2',
  textSecondary: '#A2ADA5',
  textMuted: '#76827A',
  font: Platform.select({ ios: 'Avenir Next', default: 'sans-serif-medium' }),
  numbers: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  ink: '#17220E',

  accent: '#D4F77D',
  success: '#A8DDB5',
  warn: '#F1CA81',
  danger: '#F3A49D',

  // Per-demo accent palettes
  wallet: {
    accent: '#D4F77D',
    glow: 'rgba(212, 247, 125, 0.12)',
  },
  gallery: {
    accent: '#E6B9AB',
    glow: 'rgba(230, 185, 171, 0.12)',
  },

  radius: {
    sm: 8,
    md: 8,
    lg: 8,
    xl: 8,
    pill: 999,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
};

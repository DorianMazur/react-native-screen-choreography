import { theme } from '../theme';

export const walletTheme = {
  background: theme.bg,
  surface: theme.surface,
  border: theme.border,
  text: theme.text,
  secondary: theme.textSecondary,
  muted: theme.textMuted,
  accent: theme.accent,
  positive: theme.success,
  negative: theme.danger,
  ink: theme.ink,
  font: theme.font,
  numbers: theme.numbers,
};

export const formatMoney = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

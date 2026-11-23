import type { ThemeColors } from '@/theme/colors';

/** Relative change vs the previous period; null when there is nothing to compare against. */
export function changeRatio(cur: number, prev: number | null): number | null {
  if (prev === null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

/** A stable colour per account index, cycling through the theme's chart-friendly colours. */
export function accountColor(index: number, theme: ThemeColors): string {
  const palette = [theme.primary, theme.info, theme.success, theme.warning, theme.danger];
  return palette[((index % palette.length) + palette.length) % palette.length];
}

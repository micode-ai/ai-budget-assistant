import { Ionicons } from '@expo/vector-icons';
import type { FatFinderFindingType } from '@budget/shared-types';
import type { Theme } from '@/theme';

export const TYPE_ICONS: Record<FatFinderFindingType, keyof typeof Ionicons.glyphMap> = {
  subscription: 'repeat',
  recurring_splurge: 'trending-up',
  large_one_off: 'alert-circle',
  category_excess: 'bar-chart',
  service_overuse: 'car',
};

export const SEVERITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export function getSeverityColor(theme: Theme, severity: string): string {
  switch (severity) {
    case 'high':
      return theme.colors.danger;
    case 'medium':
      return theme.colors.warning;
    default:
      return theme.colors.info;
  }
}

export function getSeverityBgColor(theme: Theme, severity: string): string {
  switch (severity) {
    case 'high':
      return theme.colors.dangerLight;
    case 'medium':
      return theme.colors.warningLight;
    default:
      return theme.colors.primaryLight;
  }
}

export function formatFatFinderDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

export function getMonthLabel(month: number, year: number, intlLocale: string): string {
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleDateString(intlLocale, { month: 'long' });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
}

import type { DebtStatus } from '@budget/shared-types';
import type { Theme } from '@/theme';

export function getStatusColor(theme: Theme, status: DebtStatus): string {
  switch (status) {
    case 'active':
      return theme.colors.primary;
    case 'overdue':
      return theme.colors.danger;
    case 'paid':
      return theme.colors.success;
    default:
      return theme.colors.textTertiary;
  }
}

export function getStatusBackgroundColor(theme: Theme, status: DebtStatus): string {
  switch (status) {
    case 'active':
      return theme.colors.primaryLight;
    case 'overdue':
      return theme.colors.dangerLight;
    case 'paid':
      return theme.colors.primaryLight;
    default:
      return theme.colors.surfaceSecondary;
  }
}

export function formatDueDate(dueDate: Date | string): string {
  const date = dueDate instanceof Date ? dueDate : new Date(dueDate);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

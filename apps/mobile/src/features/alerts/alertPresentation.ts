import type { Ionicons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import type { AnomalyAlert } from '@budget/shared-types';

export const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  duplicate_charge: 'copy-outline',
  price_increase: 'trending-up-outline',
  category_spike: 'flame-outline',
  recurring_suggestion: 'repeat-outline',
  possible_merge: 'git-merge-outline',
  price_overcharge: 'pricetag-outline',
};

export function renderAlertBody(
  alert: AnomalyAlert,
  t: TFunction,
): { title: string; body: string } {
  const p = alert.params as Record<string, string | number>;
  switch (alert.type) {
    case 'duplicate_charge':
      return {
        title: t('alerts.duplicateTitle'),
        body: t('alerts.duplicateBody', {
          merchant: p.merchant,
          amount: p.amount,
          currency: p.currencyCode,
        }),
      };
    case 'price_increase':
      return {
        title: t('alerts.priceIncreaseTitle', { merchant: p.merchant }),
        body: t('alerts.priceIncreaseBody', {
          merchant: p.merchant,
          oldAmount: p.oldAmount,
          newAmount: p.newAmount,
          currency: p.currencyCode,
          percent: p.percent,
        }),
      };
    case 'category_spike':
      return {
        title: t('alerts.spikeTitle'),
        body: t('alerts.spikeBody', { category: p.categoryName, percent: p.percent }),
      };
    case 'recurring_suggestion':
      return {
        title: t('alerts.recurringTitle', { merchant: p.merchant }),
        body: t('alerts.recurringBody', {
          merchant: p.merchant,
          amount: p.amount,
          currency: p.currencyCode,
          cycle: t(p.cycle === 'weekly' ? 'alerts.cycleWeekly' : 'alerts.cycleMonthly'),
        }),
      };
    case 'possible_merge':
      return {
        title: t('alerts.mergeTitle'),
        body: t('alerts.mergeBody', {
          merchant: p.merchant,
          amountA: p.amountA,
          currencyA: p.currencyA,
          amountB: p.amountB,
          currencyB: p.currencyB,
        }),
      };
    case 'price_overcharge': {
      const findingCount = Array.isArray((alert.params as { findings?: unknown }).findings)
        ? ((alert.params as { findings: unknown[] }).findings).length
        : 0;
      return {
        title: t('alerts.priceCheckTitle'),
        body: t('alerts.priceCheckBody', {
          count: findingCount,
          merchant: p.merchant,
          amount: p.totalAmount,
          currency: p.currencyCode,
        }),
      };
    }
    default:
      return { title: String(alert.type), body: '' };
  }
}

import type { TFunction } from 'i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { ChildBenefitCoverage, ChildCostSummary } from '@budget/shared-types';

export interface ChildShareLine {
  emoji: string;
  label: string;
  value: string;
}

export interface ChildSharePayload {
  title: string;
  lines: ChildShareLine[];
  footer: string;
}

/**
 * What the child share card says: the year, the year's total, the average per
 * month and (with 800+ income) the coverage percent. Nothing else — no
 * merchant, no category, no line. The child's name appears only when the
 * parent turns it on (`name` non-null); the default card is anonymous.
 */
export function buildChildSharePayload(input: {
  year: number;
  summary: ChildCostSummary;
  coverage: ChildBenefitCoverage | null;
  currency: string;
  /** Null hides the name (the default). */
  name: string | null;
  t: TFunction;
}): ChildSharePayload {
  const { year, summary, coverage, currency, name, t } = input;
  const trimmed = name?.trim();
  const lines: ChildShareLine[] = [
    { emoji: '📅', label: t('childCosts.share.yearTotal', { year }), value: formatCurrency(summary.yearTotal, currency) },
    { emoji: '📊', label: t('childCosts.averagePerMonth'), value: formatCurrency(summary.averagePerMonth, currency) },
  ];
  if (coverage && coverage.percent !== null) {
    lines.push({ emoji: '👶', label: t('childCosts.share.coverage'), value: `${coverage.percent}%` });
  }
  return {
    title: trimmed ? t('childCosts.share.titleNamed', { name: trimmed, year }) : t('childCosts.share.title', { year }),
    lines,
    footer: t('childCosts.share.footer'),
  };
}

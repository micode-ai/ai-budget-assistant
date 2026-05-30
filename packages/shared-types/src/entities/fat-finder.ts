import type { Currency } from './primitives';

export type FatFinderFindingType = 'subscription' | 'recurring_splurge' | 'large_one_off' | 'category_excess' | 'service_overuse';

export interface FatFinderFinding {
  id: string;
  type: FatFinderFindingType;
  title: string;
  description: string;
  currentMonthly: number;
  suggestedMonthly: number;
  potentialSavings: number;
  severity: 'low' | 'medium' | 'high';
  actionSuggestion: string;
  relatedExpenses?: { description: string; amount: number; date: string }[];
}

export interface FatFinderReport {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  findings: FatFinderFinding[];
  totalPotentialSavings: number;
  currencyCode: Currency;
  generatedAt: string;
}

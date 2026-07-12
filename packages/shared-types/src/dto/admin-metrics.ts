export interface CohortRetentionRow {
  cohortWeekStart: string; // ISO date (Monday, UTC) of the signup week
  cohortSize: number;
  retention: Array<number | null>; // retention[n] = fraction (0..1) active in week n; null if week n not fully elapsed
}

export interface RetentionBlock {
  weekly: CohortRetentionRow[]; // most-recent cohort last
  headline: { w1: number | null; w4: number | null; w8: number | null }; // pooled across qualifying cohorts
}

export interface ActivationBlock {
  windowDays: number;
  cohortSize: number; // signups old enough for the window, within the last 90d
  activatedWithinWindow: number;
  activationRate: number; // 0..1
  everActivatedRate: number; // 0..1
}

export interface EngagementBlock {
  dau: number;
  wau: number;
  mau: number;
  dauMauRatio: number; // 0..1
}

export interface GrowthPoint {
  period: string; // 'YYYY-MM'
  newUsers: number;
}

export interface GrowthBlock {
  monthly: GrowthPoint[]; // oldest first, includes current partial month
  momGrowthRate: number | null; // last complete month vs previous complete month
}

export interface MonetizationBlock {
  mrrUsd: number;
  mrrApproximate: boolean;
  payingUsers: number;
  trialingUsers: number;
  arpuUsd: number; // mrr / MAU (0 if MAU 0)
  arppuUsd: number; // mrr / payingUsers (0 if 0)
  freeToPaidConversion: number; // payingUsers / totalUsers (0 if 0)
  trialToPaidConversion: number | null; // ended trials that became active paid; null if no ended trials
  logoChurnMonthly: number | null;
  revenueChurnMonthly: number | null;
  aiCogsUsd: number;
  grossMargin: number | null; // (mrr - aiCogs) / mrr; null if mrr 0
}

export interface SegmentMetrics {
  segment: 'pl' | 'other';
  users: number;
  retentionHeadline: { w1: number | null; w4: number | null; w8: number | null };
  activationRate: number;
  freeToPaidConversion: number;
  mrrUsd: number;
}

export interface ScaleContext {
  totalUsers: number;
  totalAccounts: number;
  totalTransactions: number;
}

export interface AdminInvestorMetricsResponse {
  generatedAt: string; // ISO
  params: { months: number; weeks: number; activationDays: number };
  retention: RetentionBlock;
  activation: ActivationBlock;
  engagement: EngagementBlock;
  growth: GrowthBlock;
  monetization: MonetizationBlock;
  segments: SegmentMetrics[]; // [pl, other]
  scale: ScaleContext;
}

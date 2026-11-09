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
  payingUsers: number; // Stripe-backed only; admin-granted tiers are excluded
  trialingUsers: number;
  compedUsers: number; // active paid tiers an admin granted with no payment behind them
  compedMrrUsd: number; // what those users would be paying at list price (revenue foregone)
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

// ─── Activation & retention report (ABA-731) ──────────────────────────────────
// "Activated" = logged a first non-deleted expense or income; "active in week n"
// = logged one during the n-th week after the Monday of signup — the same
// definition the investor metrics use, so the two pages agree.

export interface ActivationSummary {
  signups: number; // users in the report's cohorts
  activated: number; // ever logged a transaction
  activatedD1: number; // within 24 h of signing up
  d1Eligible: number; // signups at least 24 h old
  activatedD7: number; // within 7 days of signing up
  d7Eligible: number; // signups at least 7 days old
  medianHoursToFirst: number | null; // over activated users
  neverActivated: number;
  /** Never activated AND never seen again more than 24 h after signing up. */
  neverReturned: number;
}

export interface ActivationCohortRow {
  cohortWeekStart: string; // Monday (UTC) of the signup week
  size: number;
  activatedD1: number;
  activatedD7: number;
  d7Eligible: number; // members at least 7 days old
  activated: number; // ever
}

export interface ActivationChannelRow {
  /** `source` of the user's first transaction (manual / ocr / voice / import / …). */
  source: string;
  users: number;
  activatedD1: number;
  /** Mean number of distinct weeks with a transaction, per user. */
  avgActiveWeeks: number;
  /** Users active in their 4th week, over users whose 4th week has fully elapsed. */
  w4Retained: number;
  w4Eligible: number;
}

export interface RetentionCurvePoint {
  week: number; // weeks since the signup week (0 = signup week)
  rate: number | null; // pooled over every cohort whose week `week` has fully elapsed
  users: number; // the pool size behind `rate`
}

export interface AdminActivationReportResponse {
  generatedAt: string;
  weeks: number; // cohorts covered: signups in the last `weeks` weeks
  internalExcluded: boolean;
  excludedAccounts: number;
  summary: ActivationSummary;
  cohorts: ActivationCohortRow[]; // most-recent cohort last
  channels: ActivationChannelRow[]; // most users first
  curve: RetentionCurvePoint[];
}

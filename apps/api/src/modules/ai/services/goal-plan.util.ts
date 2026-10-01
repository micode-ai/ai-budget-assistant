/**
 * Pure, deterministic parts of an AI savings-goal plan. Everything that can be
 * derived from the goal and the user's 3-month averages is computed here; the
 * model is only asked for judgment (category limit suggestions, labels and the
 * narrative summary) and its output is merged on top by `mergeGoalPlan`.
 */

export type GoalFeasibility = 'easy' | 'moderate' | 'challenging' | 'unrealistic';

export interface GoalPlanInputs {
  targetAmount: number;
  currentAmount: number;
  monthsRemaining: number;
  avgMonthlyIncome: number;
  avgMonthlyExpenses: number;
  now: Date;
  deadline: Date;
}

export interface GoalCheckpoint {
  date: string;
  targetAmount: number;
  label: string;
}

export interface GoalCategoryLimit {
  categoryName: string;
  currentMonthly: number;
  suggestedMonthly: number;
  savingsPerMonth: number;
}

export interface ComputedGoalPlan {
  monthlyContribution: number;
  weeklyContribution: number;
  checkpoints: GoalCheckpoint[];
  estimatedCompletionDate: string;
  feasibility: GoalFeasibility;
}

export interface GoalPlanNarrative {
  categoryLimits?: Array<{ categoryName?: unknown; suggestedMonthly?: unknown }>;
  checkpointLabels?: unknown;
  summary?: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const isoDate = (d: Date): string => d.toISOString().split('T')[0];

/** Feasibility thresholds: monthly need as a share of the average monthly savings. */
export function computeFeasibility(
  monthlyRequired: number,
  avgMonthlyIncome: number,
  avgMonthlyExpenses: number,
): GoalFeasibility {
  if (monthlyRequired <= 0) return 'easy';
  const avgSavings = avgMonthlyIncome - avgMonthlyExpenses;
  if (avgSavings <= 0) return 'unrealistic';
  if (monthlyRequired > avgMonthlyIncome) return 'unrealistic';
  const ratio = monthlyRequired / avgSavings;
  if (ratio < 0.3) return 'easy';
  if (ratio < 0.6) return 'moderate';
  if (ratio <= 0.9) return 'challenging';
  return 'unrealistic';
}

export function computeGoalPlan(input: GoalPlanInputs): ComputedGoalPlan {
  const { targetAmount, currentAmount, monthsRemaining, avgMonthlyIncome, avgMonthlyExpenses, now, deadline } = input;
  const remaining = Math.max(0, targetAmount - currentAmount);
  const monthlyRequired = remaining / Math.max(1, monthsRemaining);
  const avgSavings = avgMonthlyIncome - avgMonthlyExpenses;

  const checkpoints: GoalCheckpoint[] = [];
  if (remaining > 0) {
    const count = Math.min(5, Math.max(3, monthsRemaining));
    const span = Math.max(0, deadline.getTime() - now.getTime());
    for (let i = 1; i <= count; i++) {
      const isLast = i === count;
      checkpoints.push({
        date: isoDate(new Date(now.getTime() + (span * i) / count)),
        targetAmount: isLast ? round2(targetAmount) : round2(currentAmount + (remaining * i) / count),
        label: `${Math.round((i / count) * 100)}%`,
      });
    }
  }

  let estimated = deadline;
  if (remaining <= 0) {
    estimated = now;
  } else if (monthlyRequired > avgSavings && avgSavings > 0) {
    // At the user's real saving capacity the goal lands after the deadline.
    estimated = new Date(now.getTime() + (remaining / avgSavings) * MONTH_MS);
  }

  return {
    monthlyContribution: round2(monthlyRequired),
    weeklyContribution: round2((monthlyRequired * 12) / 52),
    checkpoints,
    estimatedCompletionDate: isoDate(estimated),
    feasibility: computeFeasibility(monthlyRequired, avgMonthlyIncome, avgMonthlyExpenses),
  };
}

/**
 * Merges the model's judgment parts onto the computed plan. Model output is
 * untrusted: category names must match a real category, suggested limits are
 * clamped to [0, currentMonthly], and currentMonthly/savingsPerMonth are
 * always derived from the user's data, never from the model.
 */
export function mergeGoalPlan(
  computed: ComputedGoalPlan,
  categories: Array<{ name: string; monthlyAvg: number }>,
  narrative: GoalPlanNarrative | null,
  fallbackSummary: string,
) {
  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));
  const categoryLimits: GoalCategoryLimit[] = [];
  const seen = new Set<string>();
  const rawLimits = Array.isArray(narrative?.categoryLimits) ? narrative.categoryLimits : [];
  for (const raw of rawLimits) {
    if (typeof raw?.categoryName !== 'string') continue;
    const key = raw.categoryName.trim().toLowerCase();
    const cat = byName.get(key);
    const suggestedRaw = Number(raw.suggestedMonthly);
    if (!cat || seen.has(key) || !Number.isFinite(suggestedRaw)) continue;
    seen.add(key);
    const suggestedMonthly = round2(Math.min(cat.monthlyAvg, Math.max(0, suggestedRaw)));
    categoryLimits.push({
      categoryName: cat.name,
      currentMonthly: cat.monthlyAvg,
      suggestedMonthly,
      savingsPerMonth: round2(cat.monthlyAvg - suggestedMonthly),
    });
  }

  const labels: unknown[] = Array.isArray(narrative?.checkpointLabels) ? (narrative.checkpointLabels as unknown[]) : [];
  const checkpoints = computed.checkpoints.map((c, i) => {
    const label = labels[i];
    return typeof label === 'string' && label.trim() ? { ...c, label: label.trim() } : c;
  });

  const summary =
    typeof narrative?.summary === 'string' && narrative.summary.trim() ? narrative.summary.trim() : fallbackSummary;

  return { ...computed, checkpoints, categoryLimits, summary };
}

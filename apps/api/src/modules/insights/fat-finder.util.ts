/**
 * Pure post-processing of the model's Fat Finder findings. The model only
 * supplies judgment fields (type, title, description, currentMonthly,
 * suggestedMonthly, actionSuggestion, relatedExpenses); the arithmetic —
 * potentialSavings, severity and the total — is derived here.
 */

export const FAT_FINDER_FINDING_TYPES = [
  'subscription',
  'recurring_splurge',
  'large_one_off',
  'category_excess',
  'service_overuse',
] as const;

export type FatFinderFindingType = (typeof FAT_FINDER_FINDING_TYPES)[number];
export type FatFinderSeverity = 'low' | 'medium' | 'high';

export interface FatFinderRelatedExpense {
  description: string;
  amount: number;
  date: string;
}

export interface FatFinderFinding {
  type: FatFinderFindingType;
  title: string;
  description: string;
  currentMonthly: number;
  suggestedMonthly: number;
  potentialSavings: number;
  severity: FatFinderSeverity;
  actionSuggestion: string;
  relatedExpenses: FatFinderRelatedExpense[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** low (<5% of total spend), medium (5-10%), high (>10%). */
export function computeSeverity(potentialSavings: number, totalSpent: number): FatFinderSeverity {
  const pct = totalSpent > 0 ? (potentialSavings / totalSpent) * 100 : 0;
  if (pct < 5) return 'low';
  if (pct <= 10) return 'medium';
  return 'high';
}

export function normalizeFatFinderFindings(
  rawFindings: unknown,
  totalSpent: number,
  maxFindings = 7,
): { findings: FatFinderFinding[]; totalPotentialSavings: number } {
  const list: any[] = Array.isArray(rawFindings) ? rawFindings : [];
  const findings: FatFinderFinding[] = [];

  for (const f of list) {
    if (findings.length >= maxFindings) break;
    if (!f || typeof f !== 'object') continue;
    const currentRaw = Number(f.currentMonthly);
    if (!Number.isFinite(currentRaw) || typeof f.title !== 'string') continue;
    const currentMonthly = round2(Math.max(0, currentRaw));
    const suggestedRaw = Number(f.suggestedMonthly);
    const suggestedMonthly = round2(
      Math.min(currentMonthly, Math.max(0, Number.isFinite(suggestedRaw) ? suggestedRaw : currentMonthly)),
    );
    const potentialSavings = round2(currentMonthly - suggestedMonthly);

    const related: FatFinderRelatedExpense[] = (Array.isArray(f.relatedExpenses) ? f.relatedExpenses : [])
      .filter((r: any) => r && typeof r === 'object')
      .slice(0, 5)
      .map((r: any) => ({
        description: String(r.description ?? ''),
        amount: Number.isFinite(Number(r.amount)) ? Number(r.amount) : 0,
        date: String(r.date ?? ''),
      }));

    findings.push({
      type: (FAT_FINDER_FINDING_TYPES as readonly string[]).includes(f.type) ? f.type : 'category_excess',
      title: f.title,
      description: typeof f.description === 'string' ? f.description : '',
      currentMonthly,
      suggestedMonthly,
      potentialSavings,
      severity: computeSeverity(potentialSavings, totalSpent),
      actionSuggestion: typeof f.actionSuggestion === 'string' ? f.actionSuggestion : '',
      relatedExpenses: related,
    });
  }

  const totalPotentialSavings = round2(findings.reduce((s, f) => s + f.potentialSavings, 0));
  return { findings, totalPotentialSavings };
}

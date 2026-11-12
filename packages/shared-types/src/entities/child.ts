export interface Child {
  id: string;
  accountId: string;
  clientId?: string;
  name: string;
  color?: string;
  archivedAt?: string | null;
}

export interface ExpenseChildLink {
  expenseId: string;
  childId: string;
  share: number;
}

export interface ChildCostSummary {
  monthTotal: number;
  yearTotal: number;
  averagePerMonth: number;
  byCategory: Array<{ categoryId: string | null; amount: number }>;
  months: Array<{ month: string /* YYYY-MM */; amount: number }>;
  fxApproximate: boolean;
}

export interface ChildBenefitCoverage {
  benefit: number;
  spending: number;
  percent: number | null;
}

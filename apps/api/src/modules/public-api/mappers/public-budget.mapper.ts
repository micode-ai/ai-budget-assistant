import type { Prisma } from '@prisma/client';
import type { PublicBudget } from '../dto/public-budget.dto';
import { BUDGET_TIER1_ENCRYPTED_FIELDS } from '../public-encryption-fields';

type Decimal = Prisma.Decimal;

/**
 * What the mapper reads: the budget's columns and live allocations (as `BudgetsService.findAll` /
 * `getProgress` return them) plus the current-period progress (from `getProgress`).
 */
export interface PublicBudgetRow {
  id: string;
  name: string;
  amount: Decimal;
  currencyCode: string;
  period: string;
  startDate: Date;
  endDate: Date | null;
  alertThreshold: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  categoryAllocations: Array<{
    categoryId: string;
    amount: Decimal;
    category: { name: string } | null;
  }>;
  progress: {
    periodStart: Date;
    periodEnd: Date;
    spent: number;
    remaining: number;
    percentageUsed: number;
    projectedTotal: number;
  };
}

export interface ToPublicBudgetOptions {
  /** `req.oauth.encryptionTier` (0 or 1; the guard refuses >= 2). */
  encryptionTier: number;
}

const money = (n: number): string => n.toFixed(2);

/**
 * A rolling period's bounds are built in server-local time by `computeBudgetPeriod`, so the
 * calendar day is read with local getters; a `custom` period carries the stored `@db.Date`
 * values (UTC midnight), read as UTC.
 */
function periodDay(d: Date, period: string): string {
  if (period === 'custom') return d.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The one place a budget becomes a `PublicBudget`. Every field is copied by name (no row spread),
 * so `clientId`, `encryptedPayload`, `userId`, ... cannot reach an integrator. At tier 1 the name
 * and the allocations' category names are `null` and listed in `encrypted_fields`.
 */
export function toPublicBudget(row: PublicBudgetRow, opts: ToPublicBudgetOptions): PublicBudget {
  const encrypted = opts.encryptionTier >= 1;
  const text = (v: string | null): string | null => (encrypted ? null : v);
  const p = row.progress;

  return {
    id: row.id,
    name: text(row.name),
    amount: row.amount.toFixed(2),
    currency: row.currencyCode,
    period: row.period,
    start_date: row.startDate.toISOString().slice(0, 10),
    end_date: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
    alert_threshold: row.alertThreshold,
    is_active: row.isActive,
    allocations: row.categoryAllocations.map((a) => ({
      category_id: a.categoryId,
      category_name: text(a.category?.name ?? null),
      amount: a.amount.toFixed(2),
    })),
    progress: {
      period_start: periodDay(p.periodStart, row.period),
      period_end: periodDay(p.periodEnd, row.period),
      spent: money(p.spent),
      remaining: money(p.remaining),
      percent_used: Math.round(p.percentageUsed * 10) / 10,
      projected_total: money(p.projectedTotal),
    },
    encrypted_fields: encrypted ? [...BUDGET_TIER1_ENCRYPTED_FIELDS] : [],
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

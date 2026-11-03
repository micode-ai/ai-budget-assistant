import { Prisma } from '@prisma/client';
import { BUDGET_TIER1_ENCRYPTED_FIELDS } from '../public-encryption-fields';
import { toPublicBudget, type PublicBudgetRow } from './public-budget.mapper';

const D = (v: string) => new Prisma.Decimal(v);

function row(over: Partial<PublicBudgetRow> = {}): PublicBudgetRow {
  return {
    id: 'b-1',
    name: 'Groceries',
    amount: D('500'),
    currencyCode: 'PLN',
    period: 'monthly',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    endDate: null,
    alertThreshold: 80,
    isActive: true,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-02T10:00:00.000Z'),
    categoryAllocations: [{ categoryId: 'c-1', amount: D('300.5'), category: { name: 'Food' } }],
    progress: {
      periodStart: new Date(2026, 10, 1),
      periodEnd: new Date(2026, 10, 30, 23, 59, 59, 999),
      spent: 123.456,
      remaining: 376.544,
      percentageUsed: 24.6912,
      projectedTotal: 400,
    },
    ...over,
  };
}

describe('toPublicBudget', () => {
  it('maps a tier 0 row in full', () => {
    expect(toPublicBudget(row(), { encryptionTier: 0 })).toEqual({
      id: 'b-1',
      name: 'Groceries',
      amount: '500.00',
      currency: 'PLN',
      period: 'monthly',
      start_date: '2026-09-01',
      end_date: null,
      alert_threshold: 80,
      is_active: true,
      allocations: [{ category_id: 'c-1', category_name: 'Food', amount: '300.50' }],
      progress: {
        period_start: '2026-11-01',
        period_end: '2026-11-30',
        spent: '123.46',
        remaining: '376.54',
        percent_used: 24.7,
        projected_total: '400.00',
      },
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-02T10:00:00.000Z',
      encrypted_fields: [],
    });
  });

  it('tier 1: name and allocation names are null and listed; amounts stay', () => {
    const out = toPublicBudget(row(), { encryptionTier: 1 });
    expect(out.name).toBeNull();
    expect(out.allocations).toEqual([
      { category_id: 'c-1', category_name: null, amount: '300.50' },
    ]);
    expect(out.encrypted_fields).toEqual(['name', 'allocations.category_name']);
    expect(out.encrypted_fields).toEqual([...BUDGET_TIER1_ENCRYPTED_FIELDS]);
  });

  it('a custom budget reports its fixed window from the stored dates', () => {
    const out = toPublicBudget(
      row({
        period: 'custom',
        progress: {
          ...row().progress,
          periodStart: new Date('2026-01-15T00:00:00.000Z'),
          periodEnd: new Date('2026-06-15T00:00:00.000Z'),
        },
      }),
      { encryptionTier: 0 }
    );
    expect(out.progress.period_start).toBe('2026-01-15');
    expect(out.progress.period_end).toBe('2026-06-15');
  });
});

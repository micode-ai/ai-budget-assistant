import { Prisma } from '@prisma/client';
import { INCOME_TIER1_ENCRYPTED_FIELDS } from '../public-encryption-fields';
import { toPublicIncome, type PublicIncomeRow } from './public-income.mapper';

const D = (v: string) => new Prisma.Decimal(v);

function row(overrides: Partial<PublicIncomeRow> = {}): PublicIncomeRow {
  return {
    id: 'i-1',
    amount: D('12.5'),
    currencyCode: 'PLN',
    date: new Date('2026-11-01T00:00:00.000Z'),
    description: 'Salary',
    notes: 'October',
    source: 'api',
    isDebt: false,
    isDebtRepayment: false,
    isSplitReceivable: false,
    createdAt: new Date('2026-11-01T12:00:00.000Z'),
    updatedAt: new Date('2026-11-02T08:30:00.000Z'),
    category: { id: 'cat-1', name: 'Salary' },
    linkedTransfer: null,
    createdByOAuthClient: { clientId: 'aba_ci_abc', name: 'AI Accounting' },
    incomeTags: [{ tag: { id: 'tag-1', name: 'work' } }],
    projectIncomes: [{ project: { id: 'proj-1', name: 'Freelance' } }],
    ...overrides,
  };
}

describe('toPublicIncome', () => {
  it('maps a tier 0 row in full', () => {
    expect(toPublicIncome(row(), { encryptionTier: 0 })).toEqual({
      id: 'i-1',
      amount: '12.50',
      currency: 'PLN',
      date: '2026-11-01',
      description: 'Salary',
      notes: 'October',
      category: { id: 'cat-1', name: 'Salary' },
      tags: [{ id: 'tag-1', name: 'work' }],
      project: { id: 'proj-1', name: 'Freelance' },
      source: 'api',
      is_debt: false,
      is_debt_repayment: false,
      is_split_receivable: false,
      is_transfer: false,
      created_by_app: { id: 'aba_ci_abc', name: 'AI Accounting' },
      encrypted_fields: [],
      created_at: '2026-11-01T12:00:00.000Z',
      updated_at: '2026-11-02T08:30:00.000Z',
    });
  });

  it('tier 1: nulls description, notes and the category/tag/project names, lists them, keeps amount and date', () => {
    const out = toPublicIncome(row(), { encryptionTier: 1 });
    expect(out.description).toBeNull();
    expect(out.notes).toBeNull();
    expect(out.category).toEqual({ id: 'cat-1', name: null });
    expect(out.tags).toEqual([{ id: 'tag-1', name: null }]);
    expect(out.project).toEqual({ id: 'proj-1', name: null });
    expect(out.encrypted_fields).toEqual([...INCOME_TIER1_ENCRYPTED_FIELDS]);
    expect(out.amount).toBe('12.50');
    expect(out.date).toBe('2026-11-01');
  });

  it('is_transfer is true when the income is a transfer leg', () => {
    expect(
      toPublicIncome(row({ linkedTransfer: { id: 't-1' } }), { encryptionTier: 0 }).is_transfer
    ).toBe(true);
  });

  it('maps absent relations to null / empty and never leaks an internal column', () => {
    const out = toPublicIncome(
      row({
        category: null,
        createdByOAuthClient: null,
        incomeTags: [],
        projectIncomes: [],
        isDebt: true,
      }),
      { encryptionTier: 0 }
    );
    expect(out.category).toBeNull();
    expect(out.created_by_app).toBeNull();
    expect(out.tags).toEqual([]);
    expect(out.project).toBeNull();
    expect(out.is_debt).toBe(true);
    const json = JSON.stringify(
      toPublicIncome({ ...row(), clientId: 'x', debtContactName: 'Bob' } as PublicIncomeRow, {
        encryptionTier: 0,
      })
    );
    expect(json).not.toContain('Bob');
    expect(json).not.toContain('clientId');
  });
});

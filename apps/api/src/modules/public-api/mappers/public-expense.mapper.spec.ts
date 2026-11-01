import { Prisma } from '@prisma/client';
import { TIER1_ENCRYPTED_FIELDS, toPublicExpense, type PublicExpenseRow } from './public-expense.mapper';

const D = (v: string) => new Prisma.Decimal(v);

function row(overrides: Partial<PublicExpenseRow> = {}): PublicExpenseRow {
  return {
    id: 'e-1',
    userId: 'user-1',
    amount: D('12.5'),
    currencyCode: 'PLN',
    date: new Date('2026-10-31T00:00:00.000Z'),
    time: '14:05',
    categoryId: 'cat-1',
    description: 'Groceries',
    merchant: 'Biedronka',
    notes: 'weekly',
    locationLat: D('52.22967560'),
    locationLng: D('21.01222870'),
    locationName: 'Warsaw',
    discountAmount: D('1'),
    depositAmount: null,
    isDebt: false,
    isDebtRepayment: false,
    isSplitReceivable: false,
    isRecurring: true,
    source: 'api',
    createdAt: new Date('2026-10-31T12:00:00.000Z'),
    updatedAt: new Date('2026-11-01T08:30:00.000Z'),
    user: { name: 'Mikhail' },
    createdByOAuthClient: { clientId: 'aba_ci_abc', name: 'AI Accounting' },
    expenseTags: [{ tag: { id: 'tag-1', name: 'work' } }],
    projectExpenses: [{ project: { id: 'proj-1', name: 'Trip' } }],
    categorySplits: [
      { categoryId: 'cat-1', amount: D('10') },
      { categoryId: 'cat-2', amount: D('2.5') },
    ],
    items: [
      {
        id: 'item-1',
        description: 'Milk',
        quantity: D('2'),
        unitPrice: D('3.5'),
        totalPrice: D('7'),
        lineDiscount: D('0'),
        categoryId: null,
      },
    ],
    hasReceipt: true,
    ...overrides,
  };
}

describe('toPublicExpense', () => {
  it('formats amounts as two-decimal strings', () => {
    const out = toPublicExpense(row(), { encryptionTier: 0, includeItems: false });
    expect(out.amount).toBe('12.50');
    expect(out.discount_amount).toBe('1.00');
    expect(out.deposit_amount).toBeNull();
    expect(out.category_splits).toEqual([
      { category_id: 'cat-1', amount: '10.00' },
      { category_id: 'cat-2', amount: '2.50' },
    ]);
  });

  it('maps a tier 0 row in full', () => {
    const out = toPublicExpense(row(), { encryptionTier: 0, includeItems: true });
    expect(out).toEqual({
      id: 'e-1',
      amount: '12.50',
      currency: 'PLN',
      date: '2026-10-31',
      time: '14:05',
      category_id: 'cat-1',
      description: 'Groceries',
      merchant: 'Biedronka',
      notes: 'weekly',
      location: { lat: 52.2296756, lng: 21.0122287, name: 'Warsaw' },
      tags: [{ id: 'tag-1', name: 'work' }],
      project: { id: 'proj-1', name: 'Trip' },
      category_splits: [
        { category_id: 'cat-1', amount: '10.00' },
        { category_id: 'cat-2', amount: '2.50' },
      ],
      items: [
        {
          id: 'item-1',
          description: 'Milk',
          quantity: '2.000',
          unit_price: '3.50',
          total_price: '7.00',
          line_discount: '0.00',
          category_id: null,
        },
      ],
      discount_amount: '1.00',
      deposit_amount: null,
      is_debt: false,
      is_debt_repayment: false,
      is_split_receivable: false,
      is_recurring: true,
      source: 'api',
      created_by_app: { id: 'aba_ci_abc', name: 'AI Accounting' },
      created_by_user: { id: 'user-1', name: 'Mikhail' },
      has_receipt: true,
      encrypted_fields: [],
      created_at: '2026-10-31T12:00:00.000Z',
      updated_at: '2026-11-01T08:30:00.000Z',
    });
  });

  it('tier 1: nulls every tier-1 text field (expense, items, tags, project) and lists them, keeps amounts', () => {
    const out = toPublicExpense(row(), { encryptionTier: 1, includeItems: true });
    expect(out.description).toBeNull();
    expect(out.merchant).toBeNull();
    expect(out.notes).toBeNull();
    expect(out.location).toEqual({ lat: 52.2296756, lng: 21.0122287, name: null });
    expect(out.items).toEqual([
      {
        id: 'item-1',
        description: null,
        quantity: '2.000',
        unit_price: '3.50',
        total_price: '7.00',
        line_discount: '0.00',
        category_id: null,
      },
    ]);
    expect(out.tags).toEqual([{ id: 'tag-1', name: null }]);
    expect(out.project).toEqual({ id: 'proj-1', name: null });
    expect(out.encrypted_fields).toEqual([
      'description',
      'notes',
      'merchant',
      'location.name',
      'items.description',
      'tags.name',
      'project.name',
    ]);
    expect(out.encrypted_fields).toEqual([...TIER1_ENCRYPTED_FIELDS]);
    expect(out.amount).toBe('12.50');
    expect(out.date).toBe('2026-10-31');
    expect(out.category_splits).toEqual([
      { category_id: 'cat-1', amount: '10.00' },
      { category_id: 'cat-2', amount: '2.50' },
    ]);
  });

  it('tier 1 list rows carry the same encrypted_fields (they describe the account, not the row)', () => {
    const out = toPublicExpense(row(), { encryptionTier: 1, includeItems: false });
    expect(out.encrypted_fields).toEqual([...TIER1_ENCRYPTED_FIELDS]);
    expect(out.tags[0].name).toBeNull();
  });

  it('tier 0 has no encrypted fields', () => {
    expect(toPublicExpense(row(), { encryptionTier: 0, includeItems: false }).encrypted_fields).toEqual([]);
  });

  it('omits items unless asked', () => {
    const out = toPublicExpense(row(), { encryptionTier: 0, includeItems: false });
    expect(Object.keys(out)).not.toContain('items');
    expect(toPublicExpense(row({ items: undefined }), { encryptionTier: 0, includeItems: true }).items).toEqual([]);
  });

  it('never emits internal keys', () => {
    const leaky = {
      ...row(),
      clientId: 'local-1',
      encryptedPayload: '{"v":1}',
      syncVersion: 7,
      receiptFingerprint: 'abc',
      externalRef: 'pko:1',
      groupExpenseId: 'g-1',
    } as PublicExpenseRow;
    const json = JSON.stringify(toPublicExpense(leaky, { encryptionTier: 0, includeItems: true }));
    for (const key of [
      'client_id',
      'clientId',
      'encrypted_payload',
      'encryptedPayload',
      'sync_version',
      'syncVersion',
      'receipt_fingerprint',
      'receiptFingerprint',
      'external_ref',
      'externalRef',
      'group_expense_id',
      'groupExpenseId',
    ]) {
      expect(json).not.toContain(`"${key}"`);
    }
  });

  it('location is null without coordinates, and for the (0,0) "no location" sentinel', () => {
    expect(
      toPublicExpense(row({ locationLat: null, locationLng: null, locationName: null }), { encryptionTier: 0, includeItems: false })
        .location,
    ).toBeNull();
    expect(
      toPublicExpense(row({ locationLat: D('0'), locationLng: D('0'), locationName: null }), { encryptionTier: 0, includeItems: false })
        .location,
    ).toBeNull();
  });

  it('no project / no app / no time', () => {
    const out = toPublicExpense(row({ projectExpenses: [], createdByOAuthClient: null, time: null }), {
      encryptionTier: 0,
      includeItems: false,
    });
    expect(out.project).toBeNull();
    expect(out.created_by_app).toBeNull();
    expect(out.time).toBeNull();
  });
});

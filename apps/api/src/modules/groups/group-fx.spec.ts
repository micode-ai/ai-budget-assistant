import { BadRequestException } from '@nestjs/common';
import { applyUnitRate, unitRate } from '../../common/utils/fx';
import { GroupsService } from './groups.service';
import {
  convertAtRate,
  entryCurrencyOptions,
  isAllowedEntryCurrency,
  isValidManualRate,
  planExpenseFxEdit,
  resolveConvertedShares,
} from './group-fx';

/**
 * ABA-654: multi-currency group expenses, converted ONCE at write time. The pure rules first, then
 * the service: conversion on create, refusal on an unknown rate, the edit rule, and the no-drift
 * property (a rate change after the write moves no balance).
 */

describe('fx unit rate (common/utils/fx.ts)', () => {
  // Provider convention: 1 base = rates[X] X. Base PLN, 1 PLN = 0.25 EUR -> 1 EUR = 4 PLN.
  it('derives the value of one foreign unit in the base, rounded to 8 decimals', () => {
    expect(unitRate('EUR', 'PLN', { EUR: 0.25 })).toBe(4);
    expect(unitRate('USD', 'PLN', { USD: 0.27 })).toBe(3.7037037);
    expect(unitRate('PLN', 'PLN', null)).toBe(1);
  });

  it('is null when the rate is unknown or nonsensical', () => {
    expect(unitRate('EUR', 'PLN', null)).toBeNull();
    expect(unitRate('EUR', 'PLN', {})).toBeNull();
    expect(unitRate('EUR', 'PLN', { EUR: 0 })).toBeNull();
    expect(unitRate('EUR', 'PLN', { EUR: -1 })).toBeNull();
  });

  it('applies a stored rate to the cent', () => {
    expect(applyUnitRate(12, 4.3167)).toBe(51.8);
    expect(applyUnitRate(100, 4.285)).toBe(428.5);
  });
});

describe('group-fx (pure)', () => {
  const at = new Date('2026-10-09T10:00:00Z');

  it('converts at a known rate and records what was entered', () => {
    const r = convertAtRate(12, 'EUR', 'PLN', 4.3167, 'provider', at);
    expect(r).toEqual({
      ok: true,
      amount: 51.8,
      fx: { originalAmount: 12, originalCurrency: 'EUR', fxRate: 4.3167, fxRateSource: 'provider', fxRateAt: at },
    });
  });

  it('stores no FX columns for the group currency', () => {
    const r = convertAtRate(12, 'PLN', 'PLN', 1, 'provider', at);
    expect(r).toEqual({
      ok: true,
      amount: 12,
      fx: { originalAmount: null, originalCurrency: null, fxRate: null, fxRateSource: null, fxRateAt: null },
    });
  });

  it('refuses a converted amount outside the ledger bounds', () => {
    expect(convertAtRate(0.01, 'UAH', 'GBP', 0.019, 'provider', at)).toEqual({ ok: false, reason: 'out_of_range' });
    expect(convertAtRate(1_000_000, 'EUR', 'PLN', 4.3, 'manual', at)).toEqual({ ok: false, reason: 'out_of_range' });
  });

  it('allows the group currency and the provider list only, group currency first in the options', () => {
    expect(isAllowedEntryCurrency('EUR', 'PLN')).toBe(true);
    expect(isAllowedEntryCurrency('CZK', 'CZK')).toBe(true);
    expect(isAllowedEntryCurrency('CZK', 'PLN')).toBe(false);
    expect(isAllowedEntryCurrency('eur', 'PLN')).toBe(false);
    expect(isAllowedEntryCurrency(undefined, 'PLN')).toBe(false);
    const opts = entryCurrencyOptions('PLN');
    expect(opts[0]).toBe('PLN');
    expect(opts.filter((c) => c === 'PLN')).toHaveLength(1);
    expect(opts).toContain('EUR');
  });

  it('validates a manual rate', () => {
    expect(isValidManualRate(4.3167)).toBe(true);
    expect(isValidManualRate(0)).toBe(false);
    expect(isValidManualRate(-1)).toBe(false);
    expect(isValidManualRate(1.123456789)).toBe(false);
    expect(isValidManualRate(Number.NaN)).toBe(false);
  });

  describe('resolveConvertedShares', () => {
    it('applies exact values entered in the original currency as weights, summing exactly to the stored amount', () => {
      // 10 EUR at 4.3333 = 43.33 PLN; 3.33 / 3.33 / 3.34 EUR.
      const raw = [
        { memberId: 'a', value: 3.33 },
        { memberId: 'b', value: 3.33 },
        { memberId: 'c', value: 3.34 },
      ];
      const shares = resolveConvertedShares(43.33, 10, 'exact', raw);
      const sum = Math.round(shares.reduce((s, x) => s + x.shareAmount, 0) * 100) / 100;
      expect(sum).toBe(43.33);
      expect(shares.map((s) => s.shareValue)).toEqual([3.33, 3.33, 3.34]);
    });

    it('still refuses exact values that do not add up to the ORIGINAL amount', () => {
      expect(() =>
        resolveConvertedShares(43.33, 10, 'exact', [
          { memberId: 'a', value: 5 },
          { memberId: 'b', value: 4 },
        ]),
      ).toThrow();
    });

    it('resolves equal and percentage splits on the converted amount', () => {
      const eq = resolveConvertedShares(51.8, 12, 'equal', [{ memberId: 'a' }, { memberId: 'b' }, { memberId: 'c' }]);
      expect(eq.map((s) => s.shareAmount)).toEqual([17.26, 17.26, 17.28]);
      const pct = resolveConvertedShares(51.8, 12, 'percentage', [
        { memberId: 'a', value: 50 },
        { memberId: 'b', value: 50 },
      ]);
      expect(pct.reduce((s, x) => s + x.shareAmount, 0)).toBeCloseTo(51.8, 2);
    });
  });

  describe('planExpenseFxEdit (spec F, Edits)', () => {
    const foreign = { amount: 51.8, originalAmount: 12, originalCurrency: 'EUR', fxRate: 4.3167 };
    const plain = { amount: 50, originalAmount: null, originalCurrency: null, fxRate: null };

    it('touches no figures when nothing figure-related changed', () => {
      expect(planExpenseFxEdit(foreign, 'PLN', {})).toEqual({ kind: 'keep' });
      expect(planExpenseFxEdit(foreign, 'PLN', { currencyCode: 'EUR', amount: 12, fxRate: 4.3167 })).toEqual({ kind: 'keep' });
      expect(planExpenseFxEdit(plain, 'PLN', { currencyCode: 'PLN' })).toEqual({ kind: 'keep' });
    });

    it('reuses the stored rate when only the original amount changes', () => {
      expect(planExpenseFxEdit(foreign, 'PLN', { amount: 20 })).toEqual({ kind: 'reuse', entryAmount: 20 });
    });

    it('needs a new rate when the currency changes, or takes the override', () => {
      expect(planExpenseFxEdit(foreign, 'PLN', { currencyCode: 'USD' })).toEqual({ kind: 'provider', entryAmount: 12, currency: 'USD' });
      expect(planExpenseFxEdit(plain, 'PLN', { currencyCode: 'EUR', fxRate: 4.2 })).toEqual({
        kind: 'manual',
        entryAmount: 50,
        currency: 'EUR',
        rate: 4.2,
      });
    });

    it('treats a changed rate alone as a manual override', () => {
      expect(planExpenseFxEdit(foreign, 'PLN', { fxRate: 4.4 })).toEqual({ kind: 'manual', entryAmount: 12, currency: 'EUR', rate: 4.4 });
    });

    it('goes back to the group currency with the entered amount', () => {
      expect(planExpenseFxEdit(foreign, 'PLN', { currencyCode: 'PLN' })).toEqual({ kind: 'group', entryAmount: 12 });
      expect(planExpenseFxEdit(plain, 'PLN', { amount: 70 })).toEqual({ kind: 'group', entryAmount: 70 });
    });
  });
});

describe('GroupsService FX (ABA-654)', () => {
  const G = 'g-1';
  const A = 'm-alice';
  const B = 'm-bob';
  let service: GroupsService;
  let prisma: any;
  let rates: { getRates: jest.Mock };
  let members: any[];
  let rows: any[];

  const mkMember = (id: string, userId: string | null) => ({
    id,
    groupId: G,
    userId,
    displayName: id,
    nameKey: id,
    claimTokenHash: null,
    paymentMethod: null,
    paymentHandle: null,
    removedAt: null,
    createdAt: new Date('2026-01-01'),
  });

  beforeEach(() => {
    const group = { id: G, name: 'Trip', emoji: null, currencyCode: 'PLN', ownerUserId: 'u-alice', guestToken: 'tok', guestAccess: true, status: 'active', ledgerVersion: 1 };
    members = [mkMember(A, 'u-alice'), mkMember(B, null)];
    rows = [];
    prisma = {
      expenseGroup: {
        findUnique: jest.fn(async () => group),
        update: jest.fn(async () => group),
      },
      expenseGroupMember: {
        findFirst: jest.fn(async ({ where }: any) => {
          const m = members.find((x) => x.id === where.id);
          return m ? { ...m, group: { ownerUserId: group.ownerUserId } } : null;
        }),
        findMany: jest.fn(async ({ where }: any) =>
          where?.id?.in ? members.filter((m) => where.id.in.includes(m.id)) : where?.userId?.not === null ? [] : members,
        ),
      },
      groupExpense: {
        findFirst: jest.fn(async ({ where }: any) => (where.id ? (rows.find((r) => r.id === where.id) ?? null) : null)),
        findMany: jest.fn(async () => rows.filter((r) => !r.deletedAt)),
        count: jest.fn(async () => rows.length),
        create: jest.fn(async ({ data }: any) => {
          const row = {
            id: `e${rows.length + 1}`,
            ...data,
            shares: data.shares.create,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
          };
          rows.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = rows.find((r) => r.id === where.id);
          Object.assign(row, data, { shares: data.shares.create });
          return row;
        }),
      },
      groupExpenseShare: { deleteMany: jest.fn() },
      groupSettlement: { findMany: jest.fn(async () => []) },
      groupMemberEvent: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    // Base PLN: 1 PLN = 0.25 EUR, i.e. 1 EUR = 4 PLN.
    rates = { getRates: jest.fn(async () => ({ base: 'PLN', rates: { PLN: 1, EUR: 0.25, USD: 0.25 }, updatedAt: '' })) };
    service = new GroupsService(prisma, { setIfAbsent: jest.fn(async () => false) } as any, { sendToUser: jest.fn() } as any, rates as any);
  });

  const dto = (over: any = {}) => ({
    clientRequestId: 'req-fx-0001',
    description: 'Dinner',
    amount: 30,
    date: '2026-10-09',
    paidByMemberId: A,
    splitType: 'equal' as const,
    shares: [{ memberId: A }, { memberId: B }],
    ...over,
  });

  it('converts a foreign expense once, at write time, storing both figures and the rate', async () => {
    await service.createExpense(G, A, dto({ currencyCode: 'EUR' }));
    expect(rates.getRates).toHaveBeenCalledWith('PLN');
    const data = prisma.groupExpense.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ amount: 120, originalAmount: 30, originalCurrency: 'EUR', fxRate: 4, fxRateSource: 'provider' });
    expect(data.fxRateAt).toBeInstanceOf(Date);
    expect(data.shares.create.map((s: any) => s.shareAmount)).toEqual([60, 60]);
  });

  it('does not ask the provider for an expense in the group currency, and stores no FX columns', async () => {
    await service.createExpense(G, A, dto());
    expect(rates.getRates).not.toHaveBeenCalled();
    const data = prisma.groupExpense.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ amount: 30, originalAmount: null, originalCurrency: null, fxRate: null, fxRateSource: null });
  });

  it('takes a manual rate over the provider', async () => {
    await service.createExpense(G, A, dto({ currencyCode: 'EUR', fxRate: 4.5 }));
    expect(prisma.groupExpense.create.mock.calls[0][0].data).toMatchObject({ amount: 135, fxRate: 4.5, fxRateSource: 'manual' });
  });

  describe('manual rate guardrail (ABA-654 review M2)', () => {
    const rejected = async (rate: number) => {
      const err: any = await service.createExpense(G, A, dto({ currencyCode: 'EUR', fxRate: rate })).catch((e) => e);
      return err;
    };

    it('rejects a manual rate more than 3x above or below the provider rate with FX_RATE_IMPLAUSIBLE, writing nothing', async () => {
      for (const rate of [12.01, 1.33, 400, 0.01]) {
        const err = await rejected(rate);
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().code).toBe('FX_RATE_IMPLAUSIBLE');
      }
      expect(prisma.groupExpense.create).not.toHaveBeenCalled();
    });

    it('accepts rates inside the band, including its edges, and stores the source as manual', async () => {
      for (const rate of [1.34, 12, 4.2]) {
        await service.createExpense(G, A, dto({ clientRequestId: `req-fx-${rate}`, currencyCode: 'EUR', fxRate: rate }));
      }
      const stored = prisma.groupExpense.create.mock.calls.map((c: any) => [c[0].data.fxRate, c[0].data.fxRateSource]);
      expect(stored).toEqual([[1.34, 'manual'], [12, 'manual'], [4.2, 'manual']]);
    });

    it('a manual rate stands when the provider has no rate for the pair (nothing to compare against)', async () => {
      rates.getRates.mockRejectedValue(new Error('provider down'));
      await service.createExpense(G, A, dto({ currencyCode: 'EUR', fxRate: 100 }));
      expect(prisma.groupExpense.create.mock.calls[0][0].data).toMatchObject({ fxRate: 100, fxRateSource: 'manual' });
    });
  });

  it('refuses with FX_RATE_UNAVAILABLE when the rate is unknown, and writes nothing', async () => {
    rates.getRates.mockRejectedValue(new Error('provider down'));
    const err = await service.createExpense(G, A, dto({ currencyCode: 'EUR' })).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse().code).toBe('FX_RATE_UNAVAILABLE');
    expect(prisma.groupExpense.create).not.toHaveBeenCalled();
  });

  it('refuses when the provider answers without that currency', async () => {
    rates.getRates.mockResolvedValue({ base: 'PLN', rates: { PLN: 1 }, updatedAt: '' });
    const err = await service.createExpense(G, A, dto({ currencyCode: 'EUR' })).catch((e) => e);
    expect(err.getResponse().code).toBe('FX_RATE_UNAVAILABLE');
  });

  it('refuses an unsupported entry currency', async () => {
    const err = await service.createExpense(G, A, dto({ currencyCode: 'XYZ' })).catch((e) => e);
    expect(err.getResponse().code).toBe('CURRENCY_UNSUPPORTED');
    expect(prisma.groupExpense.create).not.toHaveBeenCalled();
  });

  it('applies exact values in the original currency as weights of the converted amount', async () => {
    await service.createExpense(
      G,
      A,
      dto({ currencyCode: 'EUR', splitType: 'exact', amount: 10, shares: [{ memberId: A, value: 7 }, { memberId: B, value: 3 }] }),
    );
    const data = prisma.groupExpense.create.mock.calls[0][0].data;
    expect(data.amount).toBe(40);
    expect(data.shares.create).toEqual([
      { memberId: A, shareValue: 7, shareAmount: 28 },
      { memberId: B, shareValue: 3, shareAmount: 12 },
    ]);
  });

  it('never converts on read: balances and the activity row stay put when the rate moves (no drift)', async () => {
    await service.createExpense(G, A, dto({ currencyCode: 'EUR' }));
    const before = await service.getDetail(G, A);
    const activityBefore = await service.getActivity(G);

    rates.getRates.mockResolvedValue({ base: 'PLN', rates: { PLN: 1, EUR: 0.2 }, updatedAt: '' }); // 1 EUR = 5 PLN now
    const after = await service.getDetail(G, A);
    const activityAfter = await service.getActivity(G);

    expect(after.balances).toEqual(before.balances);
    expect(after.balances.find((b) => b.memberId === B)!.netAmount).toBe(-60);
    expect(activityAfter).toEqual(activityBefore);
    const e = activityAfter.items[0].kind === 'expense' ? activityAfter.items[0].expense : null;
    expect(e).toMatchObject({ amount: 120, originalAmount: 30, originalCurrency: 'EUR', fxRate: 4, fxRateSource: 'provider' });
    // Reads never reach the provider.
    expect(rates.getRates).toHaveBeenCalledTimes(1);
  });

  describe('updateExpense', () => {
    beforeEach(async () => {
      await service.createExpense(G, A, dto({ currencyCode: 'EUR' })); // 30 EUR @ 4 = 120 PLN
      rates.getRates.mockClear();
      // The provider has moved since: 1 EUR = 5 PLN, 1 USD = 4 PLN.
      rates.getRates.mockResolvedValue({ base: 'PLN', rates: { PLN: 1, EUR: 0.2, USD: 0.25 }, updatedAt: '' });
    });

    it('a new amount reuses the STORED rate, not today\'s', async () => {
      await service.updateExpense(G, A, 'e1', { amount: 40 });
      expect(rates.getRates).not.toHaveBeenCalled();
      expect(rows[0]).toMatchObject({ amount: 160, originalAmount: 40, originalCurrency: 'EUR', fxRate: 4 });
    });

    it('editing anything else touches no figures', async () => {
      const at = rows[0].fxRateAt;
      await service.updateExpense(G, A, 'e1', { description: 'Late dinner' });
      expect(rates.getRates).not.toHaveBeenCalled();
      expect(rows[0]).toMatchObject({ description: 'Late dinner', amount: 120, originalAmount: 30, fxRate: 4, fxRateAt: at });
    });

    it('a new currency fetches a new rate', async () => {
      await service.updateExpense(G, A, 'e1', { currencyCode: 'USD' });
      expect(rates.getRates).toHaveBeenCalledWith('PLN');
      expect(rows[0]).toMatchObject({ amount: 120, originalAmount: 30, originalCurrency: 'USD', fxRate: 4, fxRateSource: 'provider' });
    });

    it('a new currency takes the override when one is given', async () => {
      await service.updateExpense(G, A, 'e1', { currencyCode: 'USD', fxRate: 3.9 });
      expect(rows[0]).toMatchObject({ amount: 117, originalCurrency: 'USD', fxRate: 3.9, fxRateSource: 'manual' });
    });

    it('an edit with an implausible manual rate is FX_RATE_IMPLAUSIBLE and changes nothing (ABA-654 review M2)', async () => {
      const before = JSON.stringify(rows[0]);
      const err: any = await service.updateExpense(G, A, 'e1', { currencyCode: 'USD', fxRate: 39 }).catch((e) => e);
      expect(err.getResponse().code).toBe('FX_RATE_IMPLAUSIBLE');
      expect(JSON.stringify(rows[0])).toBe(before);
    });

    it('back to the group currency clears the FX columns', async () => {
      await service.updateExpense(G, A, 'e1', { currencyCode: 'PLN', amount: 125 });
      expect(rows[0]).toMatchObject({ amount: 125, originalAmount: null, originalCurrency: null, fxRate: null, fxRateSource: null });
    });

    it('a new currency with no rate available is refused and nothing is written', async () => {
      rates.getRates.mockRejectedValue(new Error('down'));
      const err = await service.updateExpense(G, A, 'e1', { currencyCode: 'USD' }).catch((e) => e);
      expect(err.getResponse().code).toBe('FX_RATE_UNAVAILABLE');
      expect(prisma.groupExpense.update).not.toHaveBeenCalled();
    });
  });

  it('fxPreview returns the provider rate, or null when unknown', async () => {
    expect(await service.fxPreview(G, 'EUR')).toEqual({ groupCurrency: 'PLN', currencyCode: 'EUR', rate: 4 });
    rates.getRates.mockRejectedValue(new Error('down'));
    expect(await service.fxPreview(G, 'EUR')).toEqual({ groupCurrency: 'PLN', currencyCode: 'EUR', rate: null });
    await expect(service.fxPreview(G, 'XYZ')).rejects.toBeInstanceOf(BadRequestException);
  });
});

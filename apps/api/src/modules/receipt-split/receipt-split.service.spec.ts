import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReceiptSplitService } from './receipt-split.service';
import { RECENT_PARTICIPANTS_OVERFETCH_MULTIPLIER } from './recent-participants.util';

function makeExpense(overrides: Record<string, any> = {}) {
  return {
    id: 'exp-1',
    accountId: 'acc-1',
    amount: 100,
    currencyCode: 'USD',
    merchant: 'Test Diner',
    userId: 'user-1',
    paidByUserId: null as string | null,
    items: [] as { id: string; totalPrice: number }[],
    ...overrides,
  };
}

/**
 * Builds a ReceiptSplitService wired to a lightweight Prisma mock, mirroring the
 * direct-construction style used by expenses.service.spec.ts. `tx` is the SAME
 * object handed to every `$transaction` callback by default, so tests can assert
 * on `tx.expense.create` / `tx.receiptSplitParticipant.create` /
 * `tx.expense.updateMany` / `tx.receiptSplitParticipant.updateMany` directly
 * without re-wiring a fresh transaction mock per test.
 */
function buildDeps(
  opts: {
    expense?: Record<string, any>;
    encryptionTier?: number;
    existingParticipants?: any[];
  } = {},
) {
  const expense = opts.expense ?? makeExpense();

  let expenseCreateCount = 0;
  const txExpenseCreate = jest.fn().mockImplementation(({ data }: any) => {
    expenseCreateCount += 1;
    return Promise.resolve({ id: `debt-${expenseCreateCount}`, ...data });
  });
  const txExpenseUpdateMany = jest.fn().mockResolvedValue({ count: 0 });

  const createdParticipantRows: any[] = [];
  const txParticipantCreate = jest.fn().mockImplementation(({ data }: any) => {
    const row = {
      id: `p-${createdParticipantRows.length}`,
      openedAt: null,
      claimedAt: null,
      settledAt: null,
      ...data,
    };
    createdParticipantRows.push(row);
    return Promise.resolve(row);
  });
  const txParticipantUpdateMany = jest.fn().mockResolvedValue({ count: 0 });

  const tx = {
    expense: { create: txExpenseCreate, updateMany: txExpenseUpdateMany },
    receiptSplitParticipant: { create: txParticipantCreate, updateMany: txParticipantUpdateMany },
  };

  const transactionMock = jest.fn(async (cb: any) => cb(tx));

  const prisma: any = {
    expense: { findFirst: jest.fn().mockResolvedValue(expense) },
    account: {
      findUnique: jest.fn().mockResolvedValue({ encryptionTier: opts.encryptionTier ?? 0 }),
    },
    // Backs resolvePayerLanguage's lookup for the guest link's ?lang= param —
    // defaults to English, matching the schema's default.
    user: {
      findUnique: jest.fn().mockResolvedValue({ language: 'en' }),
    },
    receiptSplitParticipant: {
      findMany: jest.fn().mockResolvedValue(opts.existingParticipants ?? []),
      findFirst: jest.fn(),
      // Default: every claim attempt "wins" (count: 1). Race tests override this
      // per-call with mockResolvedValueOnce to model a losing concurrent claim.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: transactionMock,
  };

  const debtsService: any = {
    recordRepayment: jest.fn().mockResolvedValue({ type: 'lent', record: { id: 'income-1' } }),
  };

  const service = new ReceiptSplitService(prisma, debtsService);
  return { service, prisma, debtsService, expense, tx, transactionMock, createdParticipantRows };
}

describe('ReceiptSplitService.createSplit', () => {
  it('writes one participant row and one isDebt+isSplitReceivable expense per person, in a single transaction, with debtContactName set to the participant name', async () => {
    const { service, tx, transactionMock } = buildDeps({ expense: makeExpense({ amount: 100 }) });

    const result = await service.createSplit('acc-1', 'user-1', 'exp-1', {
      mode: 'equal',
      participants: [{ name: 'Alice' }, { name: 'Bob' }],
    } as any);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(tx.expense.create).toHaveBeenCalledTimes(2);
    expect(tx.receiptSplitParticipant.create).toHaveBeenCalledTimes(2);

    const debtCalls = tx.expense.create.mock.calls.map((c: any) => c[0].data);
    expect(debtCalls.every((d: any) => d.isDebt === true)).toBe(true);
    expect(debtCalls.every((d: any) => d.isSplitReceivable === true)).toBe(true);
    expect(debtCalls.map((d: any) => d.debtContactName)).toEqual(['Alice', 'Bob']);
    // Plain random uuid, not the old deterministic `split-<expenseId>-<index>` —
    // the concurrent-double-create guard moved to the participant table's
    // (expense_id, seq) partial unique index, so this no longer needs to collide.
    expect(debtCalls.every((d: any) => !String(d.clientId).startsWith('split-'))).toBe(true);

    const participantCalls = tx.receiptSplitParticipant.create.mock.calls.map((c: any) => c[0].data);
    // seq is the participant's 0-based index in the create loop — this is what the
    // partial unique index (expense_id, seq) WHERE cancelled_at IS NULL is built on.
    expect(participantCalls.map((p: any) => p.seq)).toEqual([0, 1]);

    expect(result.participants).toHaveLength(2);
    expect(result.participants.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    // Equal split of 100 among 2 guests + the payer (3 heads): 33.33 each, payer 33.34.
    expect(result.participants.every((p) => p.amount === 33.33)).toBe(true);
    expect(result.ownShare).toBe(33.34);
  });

  it('is idempotent: called twice for the same expense it returns the existing split rather than minting a second set of tokens', async () => {
    const deps = buildDeps({ expense: makeExpense({ amount: 100 }) });
    const { service, prisma, transactionMock, createdParticipantRows } = deps;

    const dto = { mode: 'equal', participants: [{ name: 'Alice' }, { name: 'Bob' }] } as any;

    // First call: pre-check finds nothing yet -> proceeds to create.
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([]);
    const first = await service.createSplit('acc-1', 'user-1', 'exp-1', dto);

    // Second call: pre-check now finds the rows the first call just created.
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce(createdParticipantRows);
    const second = await service.createSplit('acc-1', 'user-1', 'exp-1', dto);

    expect(transactionMock).toHaveBeenCalledTimes(1); // never called a second time
    expect(second.participants.map((p) => p.id)).toEqual(first.participants.map((p) => p.id));
    expect(second).toEqual(first);
  });

  it('after a cancel, the idempotency pre-check excludes the dead split so a new one can be created', async () => {
    const deps = buildDeps({ expense: makeExpense({ amount: 100 }) });
    const { service, prisma, transactionMock } = deps;

    // The real query filters cancelledAt: null, so a cancelled split's old rows
    // never come back here — model that directly (an all-cancelled expense looks
    // exactly like a never-split one to this pre-check).
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([]);

    const result = await service.createSplit('acc-1', 'user-1', 'exp-1', {
      mode: 'equal',
      participants: [{ name: 'Alice' }],
    } as any);

    // Proves the fix, not just the outcome: the pre-check's WHERE must actually
    // carry cancelledAt: null, or this test would pass for the wrong reason.
    expect(prisma.receiptSplitParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cancelledAt: null }) }),
    );
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(result.participants).toHaveLength(1);
  });

  describe('validation — rejected before any write', () => {
    it('rejects zero participants', async () => {
      const { service, transactionMock } = buildDeps();
      await expect(
        service.createSplit('acc-1', 'user-1', 'exp-1', { mode: 'equal', participants: [] } as any),
      ).rejects.toThrow(BadRequestException);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('rejects more than 20 participants', async () => {
      const { service, transactionMock } = buildDeps();
      const participants = Array.from({ length: 21 }, (_, i) => ({ name: `P${i}` }));
      await expect(
        service.createSplit('acc-1', 'user-1', 'exp-1', { mode: 'equal', participants } as any),
      ).rejects.toThrow(BadRequestException);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('rejects a blank participant name (blank after trim)', async () => {
      const { service, transactionMock } = buildDeps();
      await expect(
        service.createSplit('acc-1', 'user-1', 'exp-1', {
          mode: 'equal',
          participants: [{ name: '   ' }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('rejects a participant whose computed share is not positive (assigned no items)', async () => {
      const expense = makeExpense({ amount: 30, items: [{ id: 'item-1', totalPrice: 30 }] });
      const { service, transactionMock } = buildDeps({ expense });
      await expect(
        service.createSplit('acc-1', 'user-1', 'exp-1', {
          mode: 'items',
          participants: [
            { name: 'Alice', itemIds: ['item-1'] },
            { name: 'Bob', itemIds: [] },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('rejects an itemIds entry that does not belong to this expense', async () => {
      const expense = makeExpense({ amount: 30, items: [{ id: 'item-1', totalPrice: 30 }] });
      const { service, transactionMock } = buildDeps({ expense });
      await expect(
        service.createSplit('acc-1', 'user-1', 'exp-1', {
          mode: 'items',
          participants: [{ name: 'Alice', itemIds: ['item-from-a-different-expense'] }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(transactionMock).not.toHaveBeenCalled();
    });

    it('rejects when participant shares exceed the bill total (0.01 tolerance)', async () => {
      // Mismatched fixture: the one assigned item's price (15) exceeds the expense's
      // recorded bill total (10), so the computed share overshoots the bill.
      const expense = makeExpense({ amount: 10, items: [{ id: 'item-1', totalPrice: 15 }] });
      const { service, transactionMock } = buildDeps({ expense });
      await expect(
        service.createSplit('acc-1', 'user-1', 'exp-1', {
          mode: 'items',
          participants: [{ name: 'Alice', itemIds: ['item-1'] }],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(transactionMock).not.toHaveBeenCalled();
    });
  });

  it('rejects an E2EE (tier-2) account with BadRequestException', async () => {
    const { service, transactionMock } = buildDeps({ encryptionTier: 2 });
    await expect(
      service.createSplit('acc-1', 'user-1', 'exp-1', {
        mode: 'equal',
        participants: [{ name: 'Alice' }],
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('generates 32-hex-char tokens and never gives two participants the same one', async () => {
    const { service, tx } = buildDeps({ expense: makeExpense({ amount: 300 }) });
    const participants = Array.from({ length: 5 }, (_, i) => ({ name: `P${i}` }));

    await service.createSplit('acc-1', 'user-1', 'exp-1', { mode: 'equal', participants } as any);

    const tokens = tx.receiptSplitParticipant.create.mock.calls.map((c: any) => c[0].data.token);
    expect(tokens).toHaveLength(5);
    for (const token of tokens) {
      expect(token).toMatch(/^[0-9a-f]{32}$/);
    }
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('ABA — QR-code bill split: mints a groupToken ONLY on the seq:0 row, and returns a groupUrl built from it', async () => {
    const { service, tx } = buildDeps({ expense: makeExpense({ amount: 100 }) });

    const result = await service.createSplit('acc-1', 'user-1', 'exp-1', {
      mode: 'equal',
      participants: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }],
    } as any);

    const participantCalls = tx.receiptSplitParticipant.create.mock.calls.map((c: any) => c[0].data);
    expect(participantCalls[0].groupToken).toMatch(/^[0-9a-f]{32}$/);
    expect(participantCalls[1].groupToken).toBeUndefined();
    expect(participantCalls[2].groupToken).toBeUndefined();

    expect(result.groupUrl).not.toBeNull();
    expect(result.groupUrl).toContain('/s/g/');
    expect(result.groupUrl).toContain(participantCalls[0].groupToken);
  });

  it('ABA — QR-code bill split: getSplit/idempotent-return paths surface groupUrl:null for a split created before groupToken existed', async () => {
    const { service, prisma } = buildDeps({ expense: makeExpense({ amount: 100 }) });
    // Models a pre-migration split: real rows, but no groupToken column value
    // (undefined here mirrors a real DB row where the column is simply absent
    // from the select, and null mirrors the actual persisted value).
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([
      {
        id: 'p-1',
        seq: 0,
        name: 'Alice',
        amount: 100,
        currencyCode: 'USD',
        token: 'a'.repeat(32),
        groupToken: null,
        openedAt: null,
        claimedAt: null,
        settledAt: null,
        cancelledAt: null,
      },
    ]);

    const result = await service.getSplit('acc-1', 'exp-1');
    expect(result.groupUrl).toBeNull();
  });

  it('re-fetches and returns the winning split on a concurrent-create P2002 race, without a second write', async () => {
    const expense = makeExpense({ amount: 100 });
    const { service, prisma, transactionMock } = buildDeps({ expense });

    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    transactionMock.mockRejectedValueOnce(p2002);

    const winnerRows = [
      {
        id: 'p-winner-1',
        name: 'Alice',
        amount: 50,
        currencyCode: 'USD',
        token: 'a'.repeat(32),
        openedAt: null,
        claimedAt: null,
        settledAt: null,
      },
      {
        id: 'p-winner-2',
        name: 'Bob',
        amount: 50,
        currencyCode: 'USD',
        token: 'b'.repeat(32),
        openedAt: null,
        claimedAt: null,
        settledAt: null,
      },
    ];
    // 1st findMany call = idempotency pre-check (empty — this request thinks it's first).
    // 2nd findMany call = the post-P2002 re-fetch, now seeing the winner's committed rows.
    prisma.receiptSplitParticipant.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(winnerRows);

    const result = await service.createSplit('acc-1', 'user-1', 'exp-1', {
      mode: 'equal',
      participants: [{ name: 'Alice' }, { name: 'Bob' }],
    } as any);

    expect(result.participants.map((p) => p.id)).toEqual(['p-winner-1', 'p-winner-2']);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('a P2002 collision does not resurrect an old cancelled split\'s dead rows alongside the real race winner', async () => {
    const expense = makeExpense({ amount: 100 });
    const { service, prisma, transactionMock } = buildDeps({ expense });

    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    transactionMock.mockRejectedValueOnce(p2002);

    // A previous cancel-then-recreate cycle left dead, cancelled rows for this
    // SAME expense sitting in the table alongside the real concurrent race
    // winner's live rows. A real DB, given the cancelledAt: null filter, would
    // return only the live row — this fake mimics that by inspecting the actual
    // `where` the code sent, so the test fails if the filter is ever removed.
    const cancelledRows = [
      {
        id: 'p-dead-1',
        name: 'Ghost',
        amount: 999,
        currencyCode: 'USD',
        token: 'c'.repeat(32),
        openedAt: null,
        claimedAt: null,
        settledAt: null,
        cancelledAt: new Date('2026-01-01'),
      },
    ];
    const liveWinnerRows = [
      {
        id: 'p-winner-1',
        name: 'Alice',
        amount: 50,
        currencyCode: 'USD',
        token: 'a'.repeat(32),
        openedAt: null,
        claimedAt: null,
        settledAt: null,
        cancelledAt: null,
      },
    ];
    const allRows = [...cancelledRows, ...liveWinnerRows];

    // 1st findMany call = idempotency pre-check (empty — this request thinks it's first).
    // 2nd findMany call = the post-P2002 re-fetch.
    prisma.receiptSplitParticipant.findMany
      .mockResolvedValueOnce([])
      .mockImplementationOnce(({ where }: any) =>
        Promise.resolve(
          where.cancelledAt === null ? allRows.filter((r) => r.cancelledAt === null) : allRows,
        ),
      );

    const result = await service.createSplit('acc-1', 'user-1', 'exp-1', {
      mode: 'equal',
      participants: [{ name: 'Alice' }],
    } as any);

    // The caller must never receive the dead cancelled row alongside the winner.
    expect(result.participants.map((p) => p.id)).toEqual(['p-winner-1']);
    expect(result.participants.some((p) => p.name === 'Ghost')).toBe(false);
    // Proof of the fix, not just the outcome — mirrors the cancelledAt: null
    // assertions already made on the pre-check (above) and on getSplit (below).
    expect(prisma.receiptSplitParticipant.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ cancelledAt: null }) }),
    );
  });

  it('a P2002 collision against an expense whose ONLY existing rows are cancelled does not hand those rows back as a fake 200 success — it rethrows', async () => {
    // This is the exact bug closed by task 7: before the cancelledAt: null filter
    // existed on this re-fetch, a collision against an all-cancelled expense would
    // return those dead rows as if they were a freshly-created split — HTTP 200
    // with links that all render "not available". The fix must instead find
    // nothing live and let the original P2002 propagate.
    const expense = makeExpense({ amount: 100 });
    const { service, prisma, transactionMock } = buildDeps({ expense });

    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    transactionMock.mockRejectedValueOnce(p2002);

    // 1st findMany = idempotency pre-check (empty — this request thinks it's first).
    // 2nd findMany = the post-P2002 re-fetch: the cancelledAt: null filter finds
    // nothing, because every row for this expense is an old cancelled one.
    prisma.receiptSplitParticipant.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      service.createSplit('acc-1', 'user-1', 'exp-1', {
        mode: 'equal',
        participants: [{ name: 'Alice' }],
      } as any),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(prisma.receiptSplitParticipant.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: expect.objectContaining({ cancelledAt: null }) }),
    );
  });
});

describe('ReceiptSplitService — cancel then re-split (seq / partial-index fix)', () => {
  it('cancel then re-split succeeds a second time and mints fresh ids, not the old cancelled ones', async () => {
    const expense = makeExpense({ amount: 100 });
    const { service, prisma, transactionMock, tx } = buildDeps({ expense });

    // 1st split: pre-check finds nothing yet.
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([]);
    const first = await service.createSplit('acc-1', 'user-1', 'exp-1', {
      mode: 'equal',
      participants: [{ name: 'Alice' }],
    } as any);

    // Cancel: expireSplitParticipants' lookup for the participants to expire.
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([
      { id: first.participants[0].id, debtExpenseId: 'debt-1' },
    ]);
    await service.cancelSplit('acc-1', 'exp-1');

    // 2nd split: the idempotency pre-check filters cancelledAt: null, so the
    // now-cancelled row from the first split is invisible here — modelled
    // directly, same convention as the other cancel-then-recreate tests above.
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([]);
    const second = await service.createSplit('acc-1', 'user-1', 'exp-1', {
      mode: 'equal',
      participants: [{ name: 'Alice' }],
    } as any);

    // 3 transactions total: 1st createSplit, cancelSplit's own expireSplitParticipants
    // write, 2nd createSplit. No P2002 either time createSplit runs — both creates
    // genuinely succeed. Before the fix this is exactly the case that stayed
    // permanently broken: the second create's deterministic clientId
    // (`split-exp-1-0`) always collided with the first split's still-present
    // (only soft-deleted) debt expense row.
    expect(transactionMock).toHaveBeenCalledTimes(3);
    expect(second.participants[0].id).not.toBe(first.participants[0].id);

    const debtClientIds = tx.expense.create.mock.calls.map((c: any) => c[0].data.clientId);
    // Both splits wrote participant seq 0 (each is index 0 within its own create
    // loop) — what keeps the two debt expenses from colliding is that clientId is
    // now a random uuid, not derived from (expenseId, seq).
    expect(new Set(debtClientIds).size).toBe(debtClientIds.length);
    expect(debtClientIds.every((id: string) => !id.startsWith('split-'))).toBe(true);

    const participantSeqs = tx.receiptSplitParticipant.create.mock.calls.map(
      (c: any) => c[0].data.seq,
    );
    expect(participantSeqs).toEqual([0, 0]);
  });
});

describe('ReceiptSplitService.getSplit', () => {
  it('reports a live split', async () => {
    const { service, prisma } = buildDeps({ expense: makeExpense({ amount: 100 }) });
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([
      {
        id: 'p-1',
        name: 'Alice',
        amount: 50,
        currencyCode: 'USD',
        token: 'a'.repeat(32),
        openedAt: null,
        claimedAt: null,
        settledAt: null,
        cancelledAt: null,
      },
    ]);

    const result = await service.getSplit('acc-1', 'exp-1');

    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].name).toBe('Alice');
  });

  it('after a cancel, reports the split as gone (404) rather than as still live', async () => {
    const { service, prisma } = buildDeps({ expense: makeExpense({ amount: 100 }) });
    // The real query filters cancelledAt: null, so a cancelled split's rows never
    // come back here — model that directly.
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([]);

    await expect(service.getSplit('acc-1', 'exp-1')).rejects.toThrow(NotFoundException);

    // Proves the fix, not just the outcome.
    expect(prisma.receiptSplitParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cancelledAt: null }) }),
    );
  });
});

describe('ReceiptSplitService.confirmParticipant', () => {
  const baseParticipant = {
    id: 'p-1',
    accountId: 'acc-1',
    expenseId: 'exp-1',
    name: 'Alice',
    amount: 50,
    currencyCode: 'USD',
    token: 'x'.repeat(32),
    debtExpenseId: 'debt-1',
    settledAt: null as Date | null,
    cancelledAt: null as Date | null,
    openedAt: null,
    claimedAt: null,
  };

  it('delegates to DebtsService.recordRepayment and stamps settledAt via an atomic claim', async () => {
    const { service, prisma, debtsService } = buildDeps();
    prisma.receiptSplitParticipant.findFirst.mockResolvedValue({ ...baseParticipant });

    const result = await service.confirmParticipant('acc-1', 'user-1', 'exp-1', 'p-1');

    expect(debtsService.recordRepayment).toHaveBeenCalledWith('acc-1', 'user-1', 'debt-1', 50);
    // The claim's WHERE re-asserts settledAt: null at the database level — this is
    // the actual race guard, not just a status-stamping update.
    expect(prisma.receiptSplitParticipant.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', settledAt: null },
      data: { settledAt: expect.any(Date) },
    });
    expect(result.status).toBe('settled');
  });

  it('rejects a second confirm so no duplicate repayment income is created', async () => {
    const { service, prisma, debtsService } = buildDeps();
    prisma.receiptSplitParticipant.findFirst.mockResolvedValue({
      ...baseParticipant,
      settledAt: new Date('2026-01-01'),
    });

    await expect(
      service.confirmParticipant('acc-1', 'user-1', 'exp-1', 'p-1'),
    ).rejects.toThrow(BadRequestException);

    expect(debtsService.recordRepayment).not.toHaveBeenCalled();
    // The already-settled fast-fail must reject before ever attempting the claim.
    expect(prisma.receiptSplitParticipant.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a cancelled participant with a clean 4xx, before recordRepayment is ever reached', async () => {
    const { service, prisma, debtsService } = buildDeps();
    prisma.receiptSplitParticipant.findFirst.mockResolvedValue({
      ...baseParticipant,
      cancelledAt: new Date('2026-01-01'),
    });

    await expect(
      service.confirmParticipant('acc-1', 'user-1', 'exp-1', 'p-1'),
    ).rejects.toThrow(BadRequestException);

    // Without this check, a cancelled participant's already-soft-deleted debt row
    // would reach DebtsService.recordRepayment, which throws a plain Error("not
    // found") — surfacing as an unhandled 500 instead of a clean 4xx.
    expect(debtsService.recordRepayment).not.toHaveBeenCalled();
    expect(prisma.receiptSplitParticipant.updateMany).not.toHaveBeenCalled();
  });

  it('closes the confirm race: a second near-simultaneous confirm cannot mint a duplicate repayment', async () => {
    const { service, prisma, debtsService } = buildDeps();
    // Both "requests" read the row via findFirst before either commits — mirrors a
    // double-tap or a client retry over a flaky connection, both seeing settledAt:
    // null.
    prisma.receiptSplitParticipant.findFirst.mockResolvedValue({ ...baseParticipant });
    // The atomic claim's WHERE (settledAt: null) can still match for only ONE of
    // them at the database level — model that as count:1 then count:0.
    prisma.receiptSplitParticipant.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const first = await service.confirmParticipant('acc-1', 'user-1', 'exp-1', 'p-1');
    await expect(
      service.confirmParticipant('acc-1', 'user-1', 'exp-1', 'p-1'),
    ).rejects.toThrow(BadRequestException);

    expect(first.status).toBe('settled');
    // The whole point of the fix: only the winning claim ever calls recordRepayment.
    expect(debtsService.recordRepayment).toHaveBeenCalledTimes(1);
  });

  it('releases the claim if recordRepayment fails, so the payer can retry', async () => {
    const { service, prisma, debtsService } = buildDeps();
    prisma.receiptSplitParticipant.findFirst.mockResolvedValue({ ...baseParticipant });
    debtsService.recordRepayment.mockRejectedValueOnce(new Error('debt lookup failed'));

    await expect(
      service.confirmParticipant('acc-1', 'user-1', 'exp-1', 'p-1'),
    ).rejects.toThrow('debt lookup failed');

    // 1st updateMany = the claim (settledAt: null -> now). 2nd = the release
    // (settledAt back to null) after recordRepayment threw. A stuck-settled
    // participant with no repayment recorded would be worse than the original race.
    expect(prisma.receiptSplitParticipant.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.receiptSplitParticipant.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'p-1', settledAt: expect.any(Date) },
      data: { settledAt: null },
    });
  });
});

describe('ReceiptSplitService.getRecentParticipantNames', () => {
  it('is scoped to the given accountId — a name from another account is never returned', async () => {
    const { service, prisma } = buildDeps();
    // Models the DB's real behavior: only rows matching the passed accountId
    // are returned. If the service ever queried without an accountId filter
    // (or the wrong one), this fake would leak "Mallory" from acc-2 in.
    const allRows = [
      { name: 'Alice', createdAt: new Date('2026-01-05'), accountId: 'acc-1' },
      { name: 'Mallory', createdAt: new Date('2026-01-06'), accountId: 'acc-2' },
    ];
    prisma.receiptSplitParticipant.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(allRows.filter((r) => r.accountId === where.accountId)),
    );

    const result = await service.getRecentParticipantNames('acc-1');

    expect(result.names).toEqual(['Alice']);
    expect(result.names).not.toContain('Mallory');
    // Proves the fix, not just the outcome — the WHERE actually carries the
    // caller's accountId, not e.g. an unscoped query.
    expect(prisma.receiptSplitParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-1' } }),
    );
  });

  it('caps the returned names at the requested limit and overfetches raw rows so dedupe has enough to work with', async () => {
    const { service, prisma } = buildDeps();
    prisma.receiptSplitParticipant.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ name: `P${i}`, createdAt: new Date(2026, 0, 10 - i) })),
    );

    const result = await service.getRecentParticipantNames('acc-1', '2');

    expect(result.names).toEqual(['P0', 'P1']);
    expect(prisma.receiptSplitParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 * RECENT_PARTICIPANTS_OVERFETCH_MULTIPLIER }),
    );
  });

  it('orders by createdAt DESC and dedupes a name reused across multiple splits down to its single most-recent entry', async () => {
    const { service, prisma } = buildDeps();
    prisma.receiptSplitParticipant.findMany.mockResolvedValue([
      { name: 'Bob', createdAt: new Date('2026-02-01') },
      { name: 'Alice', createdAt: new Date('2026-01-15') },
      { name: 'Bob', createdAt: new Date('2026-01-01') }, // older repeat, must be dropped
    ]);

    const result = await service.getRecentParticipantNames('acc-1');

    expect(result.names).toEqual(['Bob', 'Alice']);
    expect(prisma.receiptSplitParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('falls back to the default limit for a missing/invalid `limit` param', async () => {
    const { service, prisma } = buildDeps();
    prisma.receiptSplitParticipant.findMany.mockResolvedValue([]);

    await service.getRecentParticipantNames('acc-1', 'not-a-number');

    expect(prisma.receiptSplitParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 8 * RECENT_PARTICIPANTS_OVERFETCH_MULTIPLIER }),
    );
  });
});

describe('ReceiptSplitService.cancelSplit', () => {
  it('soft-deletes the debt rows, expires the participants, AND stamps cancelledAt', async () => {
    const { service, prisma, tx } = buildDeps();
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([
      { id: 'p-1', debtExpenseId: 'debt-1' },
      { id: 'p-2', debtExpenseId: 'debt-2' },
    ]);

    const result = await service.cancelSplit('acc-1', 'exp-1');

    expect(tx.expense.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['debt-1', 'debt-2'] } },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    // cancelledAt is what makes this split genuinely inert — distinct from a
    // naturally-expired-but-uncancelled split, which must NOT carry it.
    expect(tx.receiptSplitParticipant.updateMany).toHaveBeenCalledWith({
      where: { expenseId: 'exp-1' },
      data: { expiresAt: expect.any(Date), cancelledAt: expect.any(Date) },
    });
    expect(result).toEqual({ success: true });
  });

  it('no-ops when the expense was never split', async () => {
    const { service, prisma, tx } = buildDeps();
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([]);

    const result = await service.cancelSplit('acc-1', 'exp-1');

    expect(tx.expense.updateMany).not.toHaveBeenCalled();
    expect(tx.receiptSplitParticipant.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });
});

describe('ReceiptSplitService.expireForExpense', () => {
  it('soft-deletes debt rows and expires participants, WITHOUT stamping cancelledAt (deleting the parent expense already makes every read path 404)', async () => {
    const { service, prisma, tx } = buildDeps();
    prisma.receiptSplitParticipant.findMany.mockResolvedValueOnce([
      { id: 'p-1', debtExpenseId: 'debt-1' },
    ]);

    await service.expireForExpense('exp-1');

    expect(tx.expense.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['debt-1'] } },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    // No cancelledAt key at all here — distinguishes this delete-cleanup path
    // from cancelSplit's write above.
    expect(tx.receiptSplitParticipant.updateMany).toHaveBeenCalledWith({
      where: { expenseId: 'exp-1' },
      data: { expiresAt: expect.any(Date) },
    });
  });

  it('never throws — logs a warning and swallows the error (fire-and-forget, mirrors AnomalyService.dismissForExpense)', async () => {
    const { service, prisma } = buildDeps();
    prisma.receiptSplitParticipant.findMany.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(service.expireForExpense('exp-1')).resolves.toBeUndefined();
  });
});

import { randomBytes, randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DebtsService } from '../debts/debts.service';
import { resolveEqualSplit, resolveItemSplit } from './split-calculator';
import {
  dedupeRecentParticipantNames,
  resolveRecentParticipantsLimit,
  RECENT_PARTICIPANTS_OVERFETCH_MULTIPLIER,
} from './recent-participants.util';
import { CreateSplitDto } from './dto';
import type {
  RecentSplitParticipantsResponse,
  SplitParticipantState,
  SplitParticipantStatus,
  SplitStateResponse,
} from '@budget/shared-types';

/** 128 bits — do NOT copy the 8-hex invitation-code pattern; 32 bits is
 * brute-forceable for a public, payment-adjacent page. */
const TOKEN_BYTES = 16;
const SPLIT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const AMOUNT_TOLERANCE = 0.01;
const MAX_PARTICIPANTS = 20;
const MAX_NAME_LENGTH = 60;
// Falls back to the API origin, which serves GET /s/:token today. The pretty
// apex form (https://ai-budget.pl/s/:token) needs a dedicated nginx block that
// does not exist yet — defaulting to it would 404 every guest link until
// someone adds that block. See APP_PUBLIC_URL in .env.example.
const GUEST_LINK_BASE = process.env.APP_PUBLIC_URL || 'https://api.ai-budget.pl';

const cleanupLogger = new Logger('ReceiptSplitCleanup');

interface ExpenseForSplit {
  id: string;
  accountId: string;
  amount: unknown;
  currencyCode: string;
  merchant: string | null;
  userId: string;
  paidByUserId: string | null;
  items: { id: string; totalPrice: unknown }[];
}

interface ParticipantRow {
  id: string;
  name: string;
  amount: unknown;
  currencyCode: string;
  token: string;
  openedAt: Date | null;
  claimedAt: Date | null;
  settledAt: Date | null;
}

/**
 * Soft-deletes a split's debt Expense rows and expires its participant links.
 * Throws on failure — callers decide whether to swallow (see
 * `ReceiptSplitService.expireForExpense` for the fire-and-forget wrapper used
 * by ExpensesService.remove, via real DI — see receipt-split.module.ts).
 *
 * `cancelled` distinguishes an explicit payer cancellation (ReceiptSplitService.
 * cancelSplit) from the delete-cleanup path: only a cancellation stamps
 * `cancelledAt`, which is what makes the split invisible to createSplit's
 * idempotency check and getSplit — a naturally-expired-but-uncancelled split
 * must stay visible there (see the schema comment on `cancelledAt`).
 *
 * Runs both writes in one transaction. No-ops when the expense has no split.
 */
async function expireSplitParticipants(
  prisma: PrismaService,
  expenseId: string,
  opts: { cancelled?: boolean } = {},
): Promise<void> {
  const participants = await prisma.receiptSplitParticipant.findMany({
    where: { expenseId },
    select: { id: true, debtExpenseId: true },
  });
  if (participants.length === 0) return;

  const debtExpenseIds = participants
    .map((p) => p.debtExpenseId)
    .filter((id): id is string => !!id);

  await prisma.$transaction(async (tx: PrismaClient) => {
    if (debtExpenseIds.length > 0) {
      await tx.expense.updateMany({
        where: { id: { in: debtExpenseIds } },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
    }
    const now = new Date();
    await tx.receiptSplitParticipant.updateMany({
      where: { expenseId },
      data: opts.cancelled ? { expiresAt: now, cancelledAt: now } : { expiresAt: now },
    });
  });
}

@Injectable()
export class ReceiptSplitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly debtsService: DebtsService,
  ) {}

  /** Resolve the expense within this account, by server PK or clientId — mirrors
   * the resolution pattern used throughout the expenses module. */
  private async resolveExpense(accountId: string, id: string): Promise<ExpenseForSplit> {
    const expense = await this.prisma.expense.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id }, { clientId: id }] },
      select: {
        id: true,
        accountId: true,
        amount: true,
        currencyCode: true,
        merchant: true,
        userId: true,
        paidByUserId: true,
        items: { where: { isDeleted: false }, select: { id: true, totalPrice: true } },
      },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  /** Tier 2 (full E2EE): items and merchant are encrypted at rest, so the server
   * cannot populate a guest page. Precedent: ExpenseCrossAccountService.moveToAccount
   * rejects encrypted expenses the same way. */
  private async assertNotEncrypted(accountId: string): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { encryptionTier: true },
    });
    if ((account?.encryptionTier ?? 0) >= 2) {
      throw new BadRequestException(
        'Cannot split a receipt on a fully end-to-end encrypted account',
      );
    }
  }

  private statusFor(p: { openedAt: Date | null; claimedAt: Date | null; settledAt: Date | null }): SplitParticipantStatus {
    if (p.settledAt) return 'settled';
    if (p.claimedAt) return 'claimed';
    if (p.openedAt) return 'opened';
    return 'sent';
  }

  /**
   * The guest page's language resolution order (guest-page-i18n.ts, binding per
   * the task brief) starts with `?lang=` from the shared link — "the payer
   * shares in their own language" — but nothing ever set that param, so every
   * guest fell straight through to Accept-Language/English regardless of what
   * language the payer actually uses. The server owns this URL and is the only
   * party that can set it, so it resolves the payer's `user.language` here.
   *
   * "Payer" mirrors GuestController.resolvePayer's resolution: `paidByUserId`
   * ("who actually paid", defaults to the creator) falling back to `userId`
   * for pre-migration rows — NOT the caller, who may be any non-viewer member
   * of a shared account creating/viewing the split on the payer's behalf.
   */
  private async resolvePayerLanguage(expense: { userId: string; paidByUserId: string | null }): Promise<string> {
    const payerId = expense.paidByUserId ?? expense.userId;
    const user = await this.prisma.user.findUnique({
      where: { id: payerId },
      select: { language: true },
    });
    return user?.language ?? 'en';
  }

  private buildGuestUrl(token: string, lang: string): string {
    return `${GUEST_LINK_BASE}/s/${token}?lang=${lang}`;
  }

  private toStateResponse(
    expense: { id: string; currencyCode: string; amount: unknown },
    participants: ParticipantRow[],
    lang: string,
  ): SplitStateResponse {
    const participantSum = participants.reduce((sum, p) => sum + Number(p.amount), 0);
    const ownShare = Math.round((Number(expense.amount) - participantSum) * 100) / 100;
    const participantStates: SplitParticipantState[] = participants.map((p) => ({
      id: p.id,
      name: p.name,
      amount: Number(p.amount),
      currencyCode: p.currencyCode,
      status: this.statusFor(p),
      url: this.buildGuestUrl(p.token, lang),
    }));
    return {
      expenseId: expense.id,
      ownShare,
      currencyCode: expense.currencyCode,
      participants: participantStates,
    };
  }

  async createSplit(
    accountId: string,
    userId: string,
    expenseId: string,
    dto: CreateSplitDto,
  ): Promise<SplitStateResponse> {
    const expense = await this.resolveExpense(accountId, expenseId);
    await this.assertNotEncrypted(accountId);
    const lang = await this.resolvePayerLanguage(expense);

    // Idempotency pre-check (ABA-316 pattern): a split already exists for this
    // expense — return it rather than minting a second set of tokens. This is a
    // read, so it runs before any validation/write below. cancelledAt: null
    // excludes a cancelled split — a naturally-expired-but-uncancelled one must
    // still be found here (see the schema comment on cancelledAt).
    const existing = await this.prisma.receiptSplitParticipant.findMany({
      where: { expenseId: expense.id, cancelledAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (existing.length > 0) {
      return this.toStateResponse(expense, existing, lang);
    }

    // --- Validation. Everything below is a read or pure computation — nothing
    // writes until the $transaction near the bottom, so a rejection here never
    // leaves a partial write. ---
    const participants = dto.participants ?? [];
    if (participants.length < 1) {
      throw new BadRequestException('At least one participant is required');
    }
    if (participants.length > MAX_PARTICIPANTS) {
      throw new BadRequestException(`At most ${MAX_PARTICIPANTS} participants are allowed`);
    }

    const trimmedNames = participants.map((p) => (p.name ?? '').trim());
    if (trimmedNames.some((n) => n.length === 0)) {
      throw new BadRequestException('Participant name cannot be blank');
    }
    if (trimmedNames.some((n) => n.length > MAX_NAME_LENGTH)) {
      throw new BadRequestException(`Participant name cannot exceed ${MAX_NAME_LENGTH} characters`);
    }

    const validItemIds = new Set(expense.items.map((i) => i.id));
    for (const p of participants) {
      for (const itemId of p.itemIds ?? []) {
        if (!validItemIds.has(itemId)) {
          throw new BadRequestException(`Item ${itemId} does not belong to this expense`);
        }
      }
    }

    // Deliberately the expense's PAID amount, not the sum of its line items — a
    // receipt carrying a discount makes those differ, and the split must validate
    // against what was actually paid, not against the pre-discount line total.
    const billTotal = Number(expense.amount);
    const participantKeys = participants.map((_, index) => String(index));

    const result =
      dto.mode === 'items'
        ? resolveItemSplit(
            expense.items.map((i) => ({ id: i.id, totalPrice: Number(i.totalPrice) })),
            participants.map((p, index) => ({
              participantId: String(index),
              itemIds: p.itemIds ?? [],
            })),
            billTotal,
          )
        : resolveEqualSplit(participantKeys, billTotal);

    const shareByKey = new Map(result.shares.map((s) => [s.participantId, s.amount]));

    for (const key of participantKeys) {
      const amount = shareByKey.get(key) ?? 0;
      if (amount <= 0) {
        throw new BadRequestException('Every participant must have a positive share');
      }
    }

    const sumShares = result.shares.reduce((sum, s) => sum + s.amount, 0);
    if (sumShares > billTotal + AMOUNT_TOLERANCE) {
      throw new BadRequestException('Participant shares exceed the bill total');
    }

    // --- Write: participant rows + one isDebt/isSplitReceivable Expense per
    // person, all in a single transaction. ---
    const expiresAt = new Date(Date.now() + SPLIT_EXPIRY_MS);

    try {
      const created = await this.prisma.$transaction(async (tx: PrismaClient) => {
        const rows: ParticipantRow[] = [];
        for (let index = 0; index < participants.length; index++) {
          const p = participants[index];
          const amount = shareByKey.get(String(index)) ?? 0;
          const name = trimmedNames[index];
          const token = randomBytes(TOKEN_BYTES).toString('hex');

          const debtExpense = await tx.expense.create({
            data: {
              accountId,
              userId,
              // Plain random uuid — the concurrent-double-create guard now lives on
              // ReceiptSplitParticipant's (expense_id, seq) partial unique index
              // (receipt_split_live_slot, see the migration + schema comment on
              // `seq`), not here. A deterministic id was the old guard, but it made
              // a cancelled-then-re-split expense permanently un-splittable: cancel
              // only soft-deletes these rows, so the id survived and a re-split
              // collided on Expense's @@unique([accountId, clientId]) forever.
              clientId: randomUUID(),
              amount,
              currencyCode: expense.currencyCode,
              description: `Split: ${expense.merchant || 'receipt'} — ${name}`,
              date: new Date(),
              isDebt: true,
              isSplitReceivable: true,
              debtContactName: name,
            },
          });

          const participantRow = await tx.receiptSplitParticipant.create({
            data: {
              accountId,
              expenseId: expense.id,
              // Backs the partial unique index (receipt_split_live_slot) that is
              // now the sole guard against a concurrent double-create: two parallel
              // requests for this expense both try to insert a live (expenseId, 0)
              // row here, one wins, the other gets P2002 (caught below, outside the
              // $transaction — see the comment on that catch).
              seq: index,
              name,
              token,
              amount,
              currencyCode: expense.currencyCode,
              itemIds: p.itemIds && p.itemIds.length > 0 ? p.itemIds : undefined,
              debtExpenseId: debtExpense.id,
              expiresAt,
            },
          });
          rows.push(participantRow);
        }
        return rows;
      });

      return this.toStateResponse(expense, created, lang);
    } catch (err: unknown) {
      // Concurrent-race: another request for the same expense won the race and
      // already committed its split. Postgres poisons a transaction after the
      // first constraint violation (ABA-313), so this catch MUST sit outside the
      // $transaction above — retrying/continuing inside it would crash on every
      // statement after the collision. Re-fetch and return the winner's rows
      // instead of throwing or writing a second set.
      if ((err as { code?: string })?.code === 'P2002') {
        // cancelledAt: null — mirrors the idempotency pre-check above and getSplit
        // below. Without it, a collision against an expense that carries an OLD
        // cancelled split re-fetches those dead rows and returns them as a
        // "successful" split: HTTP 200 with links that all render "not
        // available", soft-deleted debt rows, and an ownShare computed against
        // shares that no longer exist.
        const race = await this.prisma.receiptSplitParticipant.findMany({
          where: { expenseId: expense.id, cancelledAt: null },
          orderBy: { createdAt: 'asc' },
        });
        if (race.length > 0) {
          return this.toStateResponse(expense, race, lang);
        }
      }
      throw err;
    }
  }

  async getSplit(accountId: string, expenseId: string): Promise<SplitStateResponse> {
    const expense = await this.resolveExpense(accountId, expenseId);
    // cancelledAt: null — a cancelled split must not be reported as live.
    const participants = await this.prisma.receiptSplitParticipant.findMany({
      where: { expenseId: expense.id, cancelledAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (participants.length === 0) {
      throw new NotFoundException('No split exists for this expense');
    }
    const lang = await this.resolvePayerLanguage(expense);
    return this.toStateResponse(expense, participants, lang);
  }

  async confirmParticipant(
    accountId: string,
    userId: string,
    expenseId: string,
    participantId: string,
  ): Promise<SplitParticipantState> {
    const expense = await this.resolveExpense(accountId, expenseId);
    const participant = await this.prisma.receiptSplitParticipant.findFirst({
      where: { id: participantId, accountId, expenseId: expense.id },
    });
    if (!participant) {
      throw new NotFoundException('Split participant not found');
    }
    if (participant.cancelledAt) {
      // A cancelled split's debt rows are already soft-deleted — reaching
      // recordRepayment here would hit DebtsService's plain Error("not found")
      // and surface as an unhandled 500 instead of a clean 4xx.
      throw new BadRequestException('This split has been cancelled');
    }
    if (participant.settledAt) {
      // A second confirm must never create a second repayment income.
      throw new BadRequestException('This participant has already been confirmed as paid');
    }
    if (!participant.debtExpenseId) {
      throw new BadRequestException('This participant has no linked debt to settle');
    }

    // Atomic claim: settledAt flips null -> now() only for the caller whose UPDATE
    // ... WHERE settledAt IS NULL still matches at the database level. A plain
    // findFirst-then-update (the previous shape) straddles the recordRepayment
    // write below with no atomicity — two near-simultaneous confirms (a
    // double-tap, or a client retry over a flaky connection) could both read
    // settledAt: null above and both go on to mint a repayment income. This
    // updateMany is the real race guard; the settledAt check above is only a
    // fast-fail for the ordinary sequential case (and gives a clean message
    // without touching the claim row).
    const settledAtClaim = new Date();
    const claim = await this.prisma.receiptSplitParticipant.updateMany({
      where: { id: participant.id, settledAt: null },
      data: { settledAt: settledAtClaim },
    });
    if (claim.count !== 1) {
      throw new BadRequestException('This participant has already been confirmed as paid');
    }

    // Same path as a manual repayment — reminders, one-tap settle, and AI debt
    // tools all see this exactly like any other recordRepayment call.
    try {
      await this.debtsService.recordRepayment(
        accountId,
        userId,
        participant.debtExpenseId,
        Number(participant.amount),
      );
    } catch (err) {
      // recordRepayment failed after we won the claim — release it so the payer
      // can retry. A stuck-settled participant with no repayment ever recorded
      // would be worse than the original race.
      await this.prisma.receiptSplitParticipant.updateMany({
        where: { id: participant.id, settledAt: settledAtClaim },
        data: { settledAt: null },
      });
      throw err;
    }

    const lang = await this.resolvePayerLanguage(expense);
    return {
      id: participant.id,
      name: participant.name,
      amount: Number(participant.amount),
      currencyCode: participant.currencyCode,
      status: this.statusFor({ ...participant, settledAt: settledAtClaim }),
      url: this.buildGuestUrl(participant.token, lang),
    };
  }

  /**
   * Distinct names this account has split receipts with before, most-recent
   * first — powers the mobile "people you've split with" suggestion chips on
   * the assignment screen (ParticipantChips.tsx / recentParticipants.ts), so
   * the payer can tap a name instead of retyping it every time.
   *
   * Account-scoped by the plain `accountId` column on
   * ReceiptSplitParticipant itself (no join, no expense lookup) — a name from
   * another account can never be returned because the WHERE clause excludes
   * every row outside this accountId. Deliberately not filtered on
   * `cancelledAt` — a cancelled split still means this account really did
   * split a receipt with that person before, which is exactly what this
   * endpoint is suggesting.
   *
   * Dedup/cap logic is the pure, unit-tested `dedupeRecentParticipantNames`
   * (recent-participants.util.ts) — this method only does the IO: fetch an
   * overshoot of raw rows (a name reused across many splits collapses to one
   * distinct entry, so the raw fetch must fetch more than `limit` rows to
   * likely still return `limit` distinct names) and hand them to the pure
   * function for the actual dedupe/cap.
   */
  async getRecentParticipantNames(
    accountId: string,
    limitParam?: string,
  ): Promise<RecentSplitParticipantsResponse> {
    const limit = resolveRecentParticipantsLimit(limitParam);
    const rows = await this.prisma.receiptSplitParticipant.findMany({
      where: { accountId },
      select: { name: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: limit * RECENT_PARTICIPANTS_OVERFETCH_MULTIPLIER,
    });
    return { names: dedupeRecentParticipantNames(rows, limit) };
  }

  async cancelSplit(accountId: string, expenseId: string): Promise<{ success: true }> {
    const expense = await this.resolveExpense(accountId, expenseId);
    await expireSplitParticipants(this.prisma, expense.id, { cancelled: true });
    return { success: true };
  }

  /**
   * Fire-and-forget wrapper for ExpensesService.remove — mirrors
   * AnomalyService.dismissForExpense's shape exactly: never throws (logs a
   * warning instead), so the call site is a bare
   * `void this.receiptSplitService.expireForExpense(...)` with no external
   * `.catch()`. A deleted receipt's guest links must stop resolving; isDeleted
   * does NOT fire the Prisma onDelete:Cascade (that only fires on a genuine hard
   * delete), so this cleanup must be explicit.
   *
   * Reached via real DI (ExpensesModule imports ReceiptSplitModule — see
   * receipt-split.module.ts's cycle-check comment), not a standalone function
   * import. Deliberately does NOT stamp cancelledAt: deleting the parent expense
   * already makes every read path 404 via resolveExpense's isDeleted:false
   * filter, so there is nothing left to re-split or report as live either way.
   */
  async expireForExpense(expenseId: string): Promise<void> {
    try {
      await expireSplitParticipants(this.prisma, expenseId);
    } catch (error) {
      cleanupLogger.warn(`expireForExpense failed for expense ${expenseId}: ${error}`);
    }
  }
}

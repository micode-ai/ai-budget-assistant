import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { sniffReceiptContentType } from './helpers/receipt-content-type';
import { FlagSplitItemDto } from './dto';
import {
  splitPaymentClaimedTitle,
  splitPaymentClaimedBody,
  splitItemFlaggedTitle,
  splitItemFlaggedBody,
} from '../notifications/notification-i18n';

/** Cap on a guest's free-text flag note — same order of magnitude as
 * `MAX_NAME_LENGTH` in receipt-split.service.ts, generous enough for a short
 * explanation without letting a public unauthenticated form store arbitrary
 * amounts of text. */
const MAX_FLAG_NOTE_LENGTH = 500;

export interface GuestExpenseView {
  merchant: string | null;
  date: Date;
  userId: string;
  paidByUserId: string | null;
  accountId: string;
  items: { id: string; description: string | null; totalPrice: unknown }[];
}

export interface GuestParticipantRow {
  id: string;
  expenseId: string;
  name: string;
  amount: unknown;
  currencyCode: string;
  itemIds: unknown;
  itemShareBp?: unknown;
  openedAt: Date | null;
  claimedAt: Date | null;
  settledAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date;
  expense: GuestExpenseView | null;
}

/** One method resolved for the payer — plain `{method, handle}` pairs, ordered. */
export interface ResolvedPaymentMethod {
  method: string;
  handle: string;
}

export interface ResolvedPayer {
  name: string;
  /** Ordered (sortOrder, or single-entry/empty for the legacy fallback). Empty = the
   * payer offered no payment method at all. */
  methods: ResolvedPaymentMethod[];
}

/** Everything the guest page needs beyond the participant row itself. */
export interface GuestPageData {
  payer: ResolvedPayer;
  claimantsByItem: Map<string, number>;
  hasReceipt: boolean;
  flaggedKeys: Set<string | null>;
}

/**
 * Data and domain rules behind the public receipt-split guest surface (`s/`).
 * `GuestController` only parses the request and renders; every query lives here.
 * Security invariants (unknown / expired / cancelled tokens collapse to the same
 * `null`, one round trip on the invalid path, no accountId or other participants'
 * data leaving) are documented on the individual methods.
 */
@Injectable()
export class ReceiptSplitGuestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Resolves a token to a usable participant row, or `null` if the token is unknown,
   * expired, or cancelled — all three collapse to the same `null` here so the caller
   * cannot branch on which one it was. A cancelled split always stamps `expiresAt` to
   * "now" at cancellation time (see expireSplitParticipants in receipt-split.service.ts),
   * so the expiry check alone would likely already catch it — the explicit
   * `cancelledAt` check is defense in depth, matching how getSplit/createSplit filter on
   * `cancelledAt: null` rather than relying on expiresAt semantics alone.
   *
   * Split into two reads (binding — do not recombine): the participant's own row is
   * fetched first, alone, with no nested relation, and every invalid outcome (unknown /
   * expired / cancelled) returns from that single query. Only a token that clears every
   * check goes on to the second query for the expense and its items. This is not just
   * tidiness — without the split, Prisma resolves the nested to-many `expense.items`
   * relation with a SECOND query issued only when the parent row was found (this schema
   * has no `relationJoins` preview feature enabled, so there is no single-query JOIN
   * plan), which meant an unknown token cost one round trip while an expired or
   * cancelled token (a real row) cost two — a timing oracle between "no such link" and
   * "this link is dead" even though the rendered body was already byte-identical.
   */
  async findUsableParticipant(token: string): Promise<GuestParticipantRow | null> {
    // Query 1 of (at most) 2 — the participant's own columns only, no nested relation.
    // This runs for EVERY token, valid or not, and is exactly one round trip regardless
    // of outcome. Explicit top-level `select` (not `include`) — defense in depth:
    // `include` alone would implicitly return every scalar column on
    // ReceiptSplitParticipant, including `accountId` and `debtExpenseId`, even though
    // nothing here ever renders them.
    const base = (await this.prisma.receiptSplitParticipant.findUnique({
      where: { token },
      select: {
        id: true,
        // Only used to count the other claimants of each shared line (see
        // countClaimantsByItem) — never rendered.
        expenseId: true,
        name: true,
        amount: true,
        currencyCode: true,
        itemIds: true,
        itemShareBp: true,
        openedAt: true,
        claimedAt: true,
        settledAt: true,
        cancelledAt: true,
        expiresAt: true,
      },
    })) as Omit<GuestParticipantRow, 'expense'> | null;

    if (!base) return null;
    if (base.cancelledAt) return null;
    if (base.expiresAt <= new Date()) return null;

    // Query 2 — only reached by a token that passed every check above, so this (and the
    // relation query Prisma issues underneath it for `items`) never runs on any of the
    // three invalid outcomes.
    const withExpense = (await this.prisma.receiptSplitParticipant.findUnique({
      where: { id: base.id },
      select: {
        expense: {
          select: {
            merchant: true,
            date: true,
            userId: true,
            paidByUserId: true,
            // expense.accountId is needed internally (the AccountMember payment-handle
            // fallback query is account-scoped) — it is never rendered in the HTML.
            accountId: true,
            items: {
              where: { isDeleted: false },
              select: { id: true, description: true, totalPrice: true },
            },
          },
        },
      },
    })) as { expense: GuestExpenseView | null } | null;

    if (!withExpense?.expense) return null;
    return { ...base, expense: withExpense.expense };
  }

  /**
   * Whether the split's expense carries a receipt scan, WITHOUT loading it.
   *
   * `receiptImage` is a `Bytes` column holding a whole photo or PDF, so the
   * page render must never select it just to decide whether to show a link —
   * `IS NOT NULL` is answered from the tuple's null bitmap and never fetches
   * the TOASTed value.
   */
  async hasReceiptImage(expenseId: string): Promise<boolean> {
    const row = await this.prisma.expense.findFirst({
      where: { id: expenseId, isDeleted: false, receiptImage: { not: null } },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * How many participants claimed each line of this split, the caller included.
   *
   * A line claimed by several people is divided between them by
   * `resolveItemSplit` at creation, so the guest page has to know the divisor
   * to show a line's amount as THIS guest's share rather than its outright
   * price. The participant's own row does not carry it — only the set of ids
   * they claimed — so it is counted across the split's live rows here.
   *
   * Reads `itemIds` and nothing else: no name, no amount, no status, so it
   * cannot widen what a guest link reveals about the other people on the bill
   * beyond the number this page already has to state. Runs only after a token
   * has been accepted, so it is outside the deliberately-one-round-trip path
   * that keeps unknown and dead tokens indistinguishable (see
   * `findUsableParticipant`).
   *
   * The count is stable for the life of a link: `cancelSplit` cancels the
   * whole split rather than individual people, so a live split's roster cannot
   * change after creation and this reproduces the divisor used back then.
   */
  async countClaimantsByItem(expenseId: string): Promise<Map<string, number>> {
    const rows = await this.prisma.receiptSplitParticipant.findMany({
      where: { expenseId, cancelledAt: null },
      select: { itemIds: true },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!Array.isArray(row.itemIds)) continue;
      // One vote per participant per line, however the row happens to be
      // shaped — a duplicated id inside one person's itemIds must not inflate
      // the divisor and under-charge everyone on that line.
      for (const itemId of new Set(row.itemIds as unknown[])) {
        if (typeof itemId !== 'string') continue;
        counts.set(itemId, (counts.get(itemId) ?? 0) + 1);
      }
    }
    return counts;
  }

  /**
   * This participant's OPEN (unresolved) flags, keyed by `itemId` (`null` =
   * whole-share report) — ABA guest-split-item-dispute. Reads `itemId` only,
   * nothing else (no note, no id, no timestamp): the guest page only needs to
   * know WHICH lines are already reported, to swap the flag form for a
   * "reported" note. Runs only after a token is accepted, same as
   * `countClaimantsByItem` above — never on the invalid-token branches, so
   * the "one query per invalid outcome" invariant is untouched.
   */
  async getActiveFlagsForParticipant(participantId: string): Promise<Set<string | null>> {
    const rows = await this.prisma.receiptSplitFlag.findMany({
      where: { participantId, resolvedAt: null },
      select: { itemId: true },
    });
    return new Set(rows.map((r) => r.itemId));
  }

  /**
   * Resolves a `groupToken` (ABA — QR-code bill split) to the anchor
   * (seq:0) participant row's `id`/`expenseId`, or `null` if the token is
   * unknown, expired, or cancelled — same three-way collapse and same
   * split-into-two-reads shape as `findUsableParticipant` above, and for the
   * identical reason (no timing oracle between "no such link" and "this
   * link is dead"). A `groupToken` only ever lives on the anchor row (see
   * the schema comment on `groupToken`), so this can never resolve to a
   * non-anchor participant.
   */
  async findUsableGroupAnchor(groupToken: string): Promise<{ id: string; expenseId: string } | null> {
    const anchor = await this.prisma.receiptSplitParticipant.findUnique({
      where: { groupToken },
      select: { id: true, expenseId: true, cancelledAt: true, expiresAt: true },
    });
    if (!anchor) return null;
    if (anchor.cancelledAt) return null;
    if (anchor.expiresAt <= new Date()) return null;
    return { id: anchor.id, expenseId: anchor.expenseId };
  }

  /**
   * Resolution order (binding, per the task brief): the payer's `UserPaymentMethod`
   * list first (ordered by `sortOrder`) — if it has any rows, those are the whole
   * answer, full stop. Only when that list is EMPTY do we fall back to the legacy
   * single-pair logic exactly as it was before this list existed: the payer's
   * user-level paymentMethod/paymentHandle, then (only if EITHER is missing) their
   * AccountMember-level pair (trip wallet's per-account Payment Settings). This way an
   * existing user who never sets up the new list loses nothing.
   * "Payer" = `paidByUserId` ("who actually paid", defaults to the creator on every
   * expense — see expenses.service.ts) falling back to `userId` for pre-migration rows.
   */
  async resolvePayer(expense: { accountId: string; userId: string; paidByUserId: string | null }): Promise<ResolvedPayer> {
    const payerId = expense.paidByUserId ?? expense.userId;
    const user = await this.prisma.user.findUnique({
      where: { id: payerId },
      select: {
        name: true,
        paymentMethod: true,
        paymentHandle: true,
        paymentMethods: {
          orderBy: { sortOrder: 'asc' },
          select: { method: true, handle: true },
        },
      },
    });

    if (user?.paymentMethods && user.paymentMethods.length > 0) {
      return { name: user.name ?? '', methods: user.paymentMethods };
    }

    // Legacy fallback — unchanged behavior from before the multi-method list existed.
    let paymentMethod = user?.paymentMethod ?? null;
    let paymentHandle = user?.paymentHandle ?? null;

    if (!paymentMethod || !paymentHandle) {
      const member = await this.prisma.accountMember.findFirst({
        where: { accountId: expense.accountId, userId: payerId },
        select: { paymentMethod: true, paymentHandle: true },
      });
      paymentMethod = paymentMethod ?? member?.paymentMethod ?? null;
      paymentHandle = paymentHandle ?? member?.paymentHandle ?? null;
    }

    const methods = paymentMethod && paymentHandle ? [{ method: paymentMethod, handle: paymentHandle }] : [];
    return { name: user?.name ?? '', methods };
  }

  /** Everything `renderGuestPage` needs besides the participant, loaded in parallel. */
  async loadPageData(participant: GuestParticipantRow): Promise<GuestPageData> {
    const payer = await this.resolvePayer(participant.expense as GuestExpenseView);
    const [claimantsByItem, hasReceipt, flaggedKeys] = await Promise.all([
      Array.isArray(participant.itemIds)
        ? this.countClaimantsByItem(participant.expenseId)
        : Promise.resolve(new Map<string, number>()),
      this.hasReceiptImage(participant.expenseId),
      this.getActiveFlagsForParticipant(participant.id),
    ]);
    return { payer, claimantsByItem, hasReceipt, flaggedKeys };
  }

  /**
   * First view stamps openedAt; a later view does not re-stamp it. JS-level guard (not
   * atomic) because the timestamp is informational only — unlike the claimedAt guard
   * in `claimPaid`.
   */
  async markOpened(participant: { id: string; openedAt: Date | null }): Promise<void> {
    if (participant.openedAt) return;
    await this.prisma.receiptSplitParticipant.update({
      where: { id: participant.id },
      data: { openedAt: new Date() },
    });
  }

  /** Names for the QR group picker, ordered by seq, plus the receipt's merchant. */
  async getGroupPicker(anchor: { expenseId: string }): Promise<{
    merchant: string | null;
    siblings: { seq: number; name: string }[];
  }> {
    const siblings = await this.prisma.receiptSplitParticipant.findMany({
      where: { expenseId: anchor.expenseId, cancelledAt: null },
      orderBy: { seq: 'asc' },
      select: { seq: true, name: true },
    });
    const expense = await this.prisma.expense.findUnique({
      where: { id: anchor.expenseId },
      select: { merchant: true },
    });
    return { merchant: expense?.merchant ?? null, siblings };
  }

  /** The live sibling at `seq` for the group confirm step, or `null`. */
  async findGroupSibling(
    anchor: { expenseId: string },
    seq: number,
  ): Promise<{ name: string; token: string } | null> {
    return this.prisma.receiptSplitParticipant.findFirst({
      where: { expenseId: anchor.expenseId, seq, cancelledAt: null },
      select: { name: true, token: true },
    });
  }

  /**
   * Loads the receipt bytes behind a guest token, or `null` for every reason a
   * guest must not get them. Split into two reads like `findUsableParticipant`
   * — the participant's own row first, so an invalid token never reaches a
   * query that would pull a multi-megabyte column.
   */
  async findReceiptFile(token: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const participant = await this.prisma.receiptSplitParticipant.findUnique({
      where: { token },
      select: { expenseId: true, cancelledAt: true, expiresAt: true },
    });
    if (!participant) return null;
    if (participant.cancelledAt) return null;
    if (participant.expiresAt <= new Date()) return null;

    const expense = await this.prisma.expense.findFirst({
      where: { id: participant.expenseId, isDeleted: false },
      select: { receiptImage: true, receiptMimeType: true },
    });
    if (!expense?.receiptImage) return null;

    const buffer = Buffer.from(expense.receiptImage);
    const contentType = sniffReceiptContentType(buffer, expense.receiptMimeType);
    if (!contentType) return null;

    return { buffer, contentType };
  }

  /**
   * Atomic claim — mirrors ReceiptSplitService.confirmParticipant's settledAt guard:
   * only the request whose UPDATE ... WHERE claimedAt IS NULL still matches wins the
   * flip from null -> now(), so a double-tap or retry can never notify twice. This is
   * the ONLY write the paid endpoint makes. Returns the stamp when THIS call won.
   */
  async claimPaid(participant: GuestParticipantRow): Promise<Date | null> {
    const claimedAt = new Date();
    const claim = await this.prisma.receiptSplitParticipant.updateMany({
      where: { id: participant.id, claimedAt: null },
      data: { claimedAt },
    });
    if (claim.count !== 1) return null;

    const expense = participant.expense as GuestExpenseView;
    const payerId = expense.paidByUserId ?? expense.userId;
    const claimedAmount = Number(participant.amount).toFixed(2);
    // Fire-and-forget — a failed push must never fail the guest's request. Passes NO
    // 5th-arg preference gate: a one-off action request (the payer must go confirm
    // it), same precedent as 'account_invitation'.
    void this.notificationsService
      .sendToUser(
        payerId,
        (lang) => splitPaymentClaimedTitle(lang, { name: participant.name }),
        (lang) => splitPaymentClaimedBody(lang, { amount: claimedAmount, currencyCode: participant.currencyCode }),
        { participantId: participant.id },
        'split_payment_claimed',
      )
      .catch(() => undefined);
    return claimedAt;
  }

  /**
   * Guest reports a line (or their whole share) as wrong. `itemId` is CLAMPED: only a
   * value in this participant's own `itemIds` is honored, otherwise it degrades to a
   * whole-share report (`null`). Dedup: at most one OPEN flag per (participantId,
   * itemId) — a repeat updates the note and does not re-notify.
   */
  async flagItem(participant: GuestParticipantRow, dto: FlagSplitItemDto): Promise<void> {
    const claimedItemIds = Array.isArray(participant.itemIds) ? (participant.itemIds as unknown[]) : [];
    const rawItemId = dto.itemId?.trim();
    const itemId = rawItemId && claimedItemIds.includes(rawItemId) ? rawItemId : null;
    const rawNote = dto.note?.trim();
    const note = rawNote ? rawNote.slice(0, MAX_FLAG_NOTE_LENGTH) : null;

    const existing = await this.prisma.receiptSplitFlag.findFirst({
      where: { participantId: participant.id, itemId, resolvedAt: null },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.receiptSplitFlag.update({
        where: { id: existing.id },
        data: { note },
      });
      return;
    }

    const expense = participant.expense as GuestExpenseView;
    await this.prisma.receiptSplitFlag.create({
      data: {
        accountId: expense.accountId,
        participantId: participant.id,
        expenseId: participant.expenseId,
        itemId,
        note,
      },
    });

    const payerId = expense.paidByUserId ?? expense.userId;
    void this.notificationsService
      .sendToUser(
        payerId,
        (lang) => splitItemFlaggedTitle(lang, { name: participant.name }),
        (lang) => splitItemFlaggedBody(lang),
        { participantId: participant.id },
        'split_item_flagged',
      )
      .catch(() => undefined);
  }
}

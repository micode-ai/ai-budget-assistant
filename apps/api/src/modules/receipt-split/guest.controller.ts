import { Controller, Get, Post, Param, Req, Header, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  renderGuestPage,
  renderNotFoundPage,
  buildGuestPayLink,
  GuestPageModel,
  GuestPaymentMethodBlock,
  GuestPaymentStatus,
} from './helpers/guest-page';
import { getGuestPageStrings, resolveGuestLang } from './helpers/guest-page-i18n';
import { splitPaymentClaimedTitle, splitPaymentClaimedBody } from '../notifications/notification-i18n';

interface GuestExpenseView {
  merchant: string | null;
  date: Date;
  userId: string;
  paidByUserId: string | null;
  accountId: string;
  items: { id: string; description: string | null; totalPrice: unknown }[];
}

interface GuestParticipantRow {
  id: string;
  name: string;
  amount: unknown;
  currencyCode: string;
  itemIds: unknown;
  openedAt: Date | null;
  claimedAt: Date | null;
  settledAt: Date | null;
  cancelledAt: Date | null;
  expiresAt: Date;
  expense: GuestExpenseView | null;
}

/** One method resolved for the payer — plain `{method, handle}` pairs, ordered. */
interface ResolvedPaymentMethod {
  method: string;
  handle: string;
}

interface ResolvedPayer {
  name: string;
  /** Ordered (sortOrder, or single-entry/empty for the legacy fallback). Empty = the
   * payer offered no payment method at all. */
  methods: ResolvedPaymentMethod[];
}

// Duplicated (deliberately) from ReceiptSplitService's private `statusFor` — 4 lines, not
// worth exporting/coupling Task 4's file to this one for. Keep in sync if the state
// machine (sent -> opened -> claimed -> settled) ever changes.
function statusFor(p: { openedAt: Date | null; claimedAt: Date | null; settledAt: Date | null }): GuestPaymentStatus {
  if (p.settledAt) return 'settled';
  if (p.claimedAt) return 'claimed';
  if (p.openedAt) return 'opened';
  return 'sent';
}

/**
 * The ONLY unauthenticated surface in the app. A guest has no account and never will —
 * this page is the entire product experience for them. Treat every line as
 * security-sensitive:
 *  - never expose accountId, another participant's name/amount, other line items, the
 *    receipt image, or anyone's email;
 *  - an unknown token, an expired token, and a cancelled token must be indistinguishable
 *    (same status code, same body, same length) — see `findUsableParticipant` and
 *    `renderNotFoundPage`;
 *  - every interpolated value is escaped by helpers/guest-page.ts, never trusted as safe
 *    markup (a participant's name is free text the payer typed).
 *
 * Deliberately only two routes (`GET /:token`, `POST /:token/paid`) — no JSON variant,
 * per the task brief: nothing consumes it, and an unused public read endpoint is attack
 * surface for free.
 */
@Controller('s')
export class GuestController {
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
  private async findUsableParticipant(token: string): Promise<GuestParticipantRow | null> {
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
        name: true,
        amount: true,
        currencyCode: true,
        itemIds: true,
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
  private async resolvePayer(expense: { accountId: string; userId: string; paidByUserId: string | null }): Promise<ResolvedPayer> {
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

  private buildModel(participant: GuestParticipantRow, payer: ResolvedPayer, token: string): GuestPageModel {
    const expense = participant.expense as GuestExpenseView;
    const amount = Number(participant.amount);
    const itemIds = Array.isArray(participant.itemIds) ? (participant.itemIds as unknown[]) : null;
    const items = itemIds
      ? expense.items
          .filter((item) => itemIds.includes(item.id))
          .map((item) => ({ description: item.description ?? '', amount: Number(item.totalPrice) }))
      : null;

    // One block per resolved method, in the same order `payer.methods` arrived in
    // (sortOrder from the DB, or the single legacy pair). `buildGuestPayLink` is the
    // untouched pure per-method builder — called once per method here, exactly as it
    // was already designed to be called.
    const paymentMethods: GuestPaymentMethodBlock[] = payer.methods.map((m) => {
      const { paymentLink, manualInstructions } = buildGuestPayLink(m.method, m.handle, amount, participant.currencyCode);
      return { method: m.method, paymentLink, manualInstructions, handle: m.handle };
    });

    return {
      guestName: participant.name,
      merchant: expense.merchant,
      dateLabel: expense.date.toISOString().slice(0, 10),
      payerName: payer.name,
      amount,
      currencyCode: participant.currencyCode,
      items,
      status: statusFor(participant),
      paymentMethods,
      postPaidAction: `/s/${token}/paid`,
    };
  }

  @Get(':token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  // The page carries the guest's own name and amount — no-store so no
  // intermediary (a shared proxy cache) or the browser's bfcache retains it.
  @Header('Cache-Control', 'no-store')
  async guestPage(@Param('token') token: string, @Req() req: Request): Promise<string> {
    const strings = getGuestPageStrings(resolveGuestLang(req));

    const participant = await this.findUsableParticipant(token);
    if (!participant) {
      return renderNotFoundPage(strings);
    }

    // First view stamps openedAt; a later view does not re-stamp it. This is a JS-level
    // guard (not an atomic conditional update) because the timestamp is informational
    // only (surfaced to the payer as a "opened" status) — not security-sensitive, unlike
    // the claimedAt guard in markPaid below.
    if (!participant.openedAt) {
      await this.prisma.receiptSplitParticipant.update({
        where: { id: participant.id },
        data: { openedAt: new Date() },
      });
    }

    const payer = await this.resolvePayer(participant.expense as GuestExpenseView);
    return renderGuestPage(this.buildModel(participant, payer, token), strings);
  }

  @Post(':token/paid')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async markPaid(@Param('token') token: string, @Req() req: Request): Promise<string> {
    const strings = getGuestPageStrings(resolveGuestLang(req));

    const participant = await this.findUsableParticipant(token);
    if (!participant) {
      return renderNotFoundPage(strings);
    }

    // Atomic claim — mirrors ReceiptSplitService.confirmParticipant's settledAt guard
    // (same file, Task 4): only the request whose UPDATE ... WHERE claimedAt IS NULL
    // still matches wins the flip from null -> now(), so a double-tap or client retry
    // can never fire the notification twice. This is the ONLY write this endpoint makes.
    const claimedAt = new Date();
    const claim = await this.prisma.receiptSplitParticipant.updateMany({
      where: { id: participant.id, claimedAt: null },
      data: { claimedAt },
    });

    if (claim.count === 1) {
      const payerId = (participant.expense as GuestExpenseView).paidByUserId ?? (participant.expense as GuestExpenseView).userId;
      const claimedAmount = Number(participant.amount).toFixed(2);
      // Fire-and-forget, like familyFeed/anomaly elsewhere in this codebase — a failed
      // push must never fail the guest's request. Localized via notification-i18n.ts
      // (mirrors accountInvitationTitle/Body) and resolved to the payer's own
      // `user.language` inside NotificationsService.sendToUser. Deliberately passes NO
      // 5th-arg gate that `sendToUser` would recognize as a preference toggle — this is
      // a one-off action request (the payer must go confirm it), same precedent as
      // 'account_invitation', not a recurring background alert a user could silence.
      void this.notificationsService
        .sendToUser(
          payerId,
          (lang) => splitPaymentClaimedTitle(lang, { name: participant.name }),
          (lang) => splitPaymentClaimedBody(lang, { amount: claimedAmount, currencyCode: participant.currencyCode }),
          { participantId: participant.id },
          'split_payment_claimed',
        )
        .catch(() => undefined);
    }

    const payer = await this.resolvePayer(participant.expense as GuestExpenseView);
    const model = this.buildModel(
      { ...participant, claimedAt: claim.count === 1 ? claimedAt : participant.claimedAt },
      payer,
      token,
    );
    return renderGuestPage(model, strings);
  }
}

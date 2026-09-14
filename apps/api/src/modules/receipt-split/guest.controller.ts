import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  Header,
  UseGuards,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  renderGuestPage,
  renderNotFoundPage,
  renderGroupPickerPage,
  renderGroupConfirmPage,
  buildGuestPayLink,
  GuestPageModel,
  GuestPaymentMethodBlock,
  GuestPaymentStatus,
} from './helpers/guest-page';
import { getGuestPageStrings, resolveGuestLang } from './helpers/guest-page-i18n';
import { allocateItemShares } from './split-calculator';
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
  private async hasReceiptImage(expenseId: string): Promise<boolean> {
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
  private async countClaimantsByItem(expenseId: string): Promise<Map<string, number>> {
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
  private async getActiveFlagsForParticipant(participantId: string): Promise<Set<string | null>> {
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
  private async findUsableGroupAnchor(groupToken: string): Promise<{ id: string; expenseId: string } | null> {
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

  private buildModel(
    participant: GuestParticipantRow,
    payer: ResolvedPayer,
    token: string,
    claimantsByItem: Map<string, number>,
    hasReceipt: boolean,
    flaggedKeys: Set<string | null>,
  ): GuestPageModel {
    const expense = participant.expense as GuestExpenseView;
    const amount = Number(participant.amount);
    const itemIds = Array.isArray(participant.itemIds) ? (participant.itemIds as unknown[]) : null;
    const rawShares = participant.itemShareBp;
    const shareBpByItem: Record<string, number> =
      rawShares && typeof rawShares === 'object' && !Array.isArray(rawShares)
        ? Object.fromEntries(
            Object.entries(rawShares as Record<string, unknown>).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === 'number' && Number.isFinite(entry[1]),
            ),
          )
        : {};
    // Each line carries the guest's OWN share, not the line's outright price:
    // printing the full price of a line three people split contradicts the
    // total right underneath it. allocateItemShares divides against the stored
    // `amount`, so the lines always add up to what the guest is asked to pay.
    const claimed = itemIds
      ? expense.items
          .filter((item) => itemIds.includes(item.id))
          .map((item) => ({
            id: item.id,
            totalPrice: Number(item.totalPrice),
            claimantCount: claimantsByItem.get(item.id) ?? 1,
            // An explicit hand-set share (ABA-550) overrides the equal division.
            shareBp: shareBpByItem[item.id],
            description: item.description ?? '',
          }))
      : null;
    const items = claimed
      ? allocateItemShares(claimed, amount).map((share, index) => ({
          id: claimed[index].id,
          description: claimed[index].description,
          amount: share.amount,
          sharedWith: share.sharedWith,
          shareBp: share.shareBp,
          flagged: flaggedKeys.has(claimed[index].id),
        }))
      : null;

    // One block per resolved method, in the same order `payer.methods` arrived in
    // (sortOrder from the DB, or the single legacy pair). `buildGuestPayLink` is the
    // pure per-method builder — called once per method here, exactly as it was already
    // designed to be called (it now also resolves 'other'/'cash' to their own
    // instruction copy, not just revolut/paypal/blik — see guest-page.ts).
    const paymentMethods: GuestPaymentMethodBlock[] = payer.methods.map((m) => {
      const { paymentLink, instructions } = buildGuestPayLink(m.method, m.handle, amount, participant.currencyCode);
      return { method: m.method, paymentLink, instructions, handle: m.handle };
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
      receiptUrl: hasReceipt ? `/s/${token}/receipt` : null,
      flagAction: `/s/${token}/flag`,
      wholeShareFlagged: flaggedKeys.has(null),
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
    const [claimantsByItem, hasReceipt, flaggedKeys] = await Promise.all([
      Array.isArray(participant.itemIds)
        ? this.countClaimantsByItem(participant.expenseId)
        : Promise.resolve(new Map<string, number>()),
      this.hasReceiptImage(participant.expenseId),
      this.getActiveFlagsForParticipant(participant.id),
    ]);
    return renderGuestPage(
      this.buildModel(participant, payer, token, claimantsByItem, hasReceipt, flaggedKeys),
      strings,
    );
  }

  /**
   * ABA — QR-code bill split. Names-only picker page for a whole split — see
   * docs/contracts/qr-code-bill-split-api.md. No route-shadow risk against
   * `GET /s/:token` above regardless of declaration order (ABA-166 class of
   * bug, checked): `:token` is a single-segment pattern
   * (`/s/:token`), while both routes here require a static "g" segment plus
   * one or two further segments — Express only matches a route when the
   * segment COUNT agrees, so a request to `/s/g/<token>` can never resolve
   * against the one-segment `:token` route.
   */
  @Get('g/:groupToken')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async groupPicker(@Param('groupToken') groupToken: string, @Req() req: Request): Promise<string> {
    const strings = getGuestPageStrings(resolveGuestLang(req));

    const anchor = await this.findUsableGroupAnchor(groupToken);
    if (!anchor) {
      return renderNotFoundPage(strings);
    }

    const siblings = await this.prisma.receiptSplitParticipant.findMany({
      where: { expenseId: anchor.expenseId, cancelledAt: null },
      orderBy: { seq: 'asc' },
      select: { seq: true, name: true },
    });

    const expense = await this.prisma.expense.findUnique({
      where: { id: anchor.expenseId },
      select: { merchant: true },
    });

    const lang = resolveGuestLang(req);
    const entries = siblings.map((s) => ({
      name: s.name,
      href: `/s/g/${groupToken}/${s.seq}?lang=${lang}`,
    }));

    return renderGroupPickerPage({ merchant: expense?.merchant ?? null, entries }, strings);
  }

  /**
   * ABA — QR-code bill split. "You are «Name» — is that you?" confirm step
   * reached from the picker page above; answers the wrong-tap open question
   * WITHOUT touching the existing `:token` handler at all. `:seq` is a small
   * position index (0..MAX_PARTICIPANTS-1), not a bearer credential — it is
   * only ever meaningful scoped by the still-secret `groupToken`.
   */
  @Get('g/:groupToken/:seq')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async groupConfirm(
    @Param('groupToken') groupToken: string,
    @Param('seq') seqParam: string,
    @Req() req: Request,
  ): Promise<string> {
    const strings = getGuestPageStrings(resolveGuestLang(req));

    const anchor = await this.findUsableGroupAnchor(groupToken);
    const seq = Number(seqParam);
    if (!anchor || !Number.isInteger(seq)) {
      return renderNotFoundPage(strings);
    }

    const sibling = await this.prisma.receiptSplitParticipant.findFirst({
      where: { expenseId: anchor.expenseId, seq, cancelledAt: null },
      select: { name: true, token: true },
    });
    if (!sibling) {
      return renderNotFoundPage(strings);
    }

    const lang = resolveGuestLang(req);
    return renderGroupConfirmPage(
      {
        name: sibling.name,
        yesHref: `/s/${sibling.token}?lang=${lang}`,
        noHref: `/s/g/${groupToken}?lang=${lang}`,
      },
      strings,
    );
  }

  /**
   * The payer's receipt scan, for the guest whose token this is.
   *
   * The page above tells a guest which lines they are being charged for and
   * what each costs them; this is how they check that against the paper
   * instead of taking it on trust. It widens what a guest link reveals — a
   * scan shows the whole bill, including the total and the lines belonging to
   * other people, which the page itself deliberately withholds — and that is
   * the intended trade: everyone on a split sat at the same table, and the
   * payer chose to share the bill with them.
   *
   * Three deliberate properties:
   *
   * - The same three-way collapse as every other guest route: unknown,
   *   expired and cancelled tokens all 404, as does a valid token whose
   *   expense has no scan, so a 404 never says which.
   * - `Content-Type` is sniffed from the bytes, never taken from the stored
   *   `receiptMimeType` — see receipt-content-type.ts. Unrecognized bytes are
   *   refused rather than served under a guess.
   * - `nosniff` on top of that, so a browser cannot re-interpret an
   *   allow-listed type as something executable.
   *
   * No route-shadow risk against `GET /s/g/:groupToken` declared above, which
   * has the same two-segment shape: this route needs a literal `receipt` as
   * its second segment and that one needs a literal `g` as its first, and a
   * participant token is 32 hex characters, never the string "g". The group
   * route is declared first either way, so `/s/g/receipt` resolves as a group
   * token rather than as a receipt for a token named "g".
   */
  @Get(':token/receipt')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async guestReceipt(@Param('token') token: string): Promise<StreamableFile> {
    const file = await this.findReceiptFile(token);
    if (!file) {
      throw new NotFoundException();
    }
    return new StreamableFile(file.buffer, { type: file.contentType, disposition: 'inline' });
  }

  /**
   * Loads the receipt bytes behind a guest token, or `null` for every reason a
   * guest must not get them. Split into two reads like `findUsableParticipant`
   * — the participant's own row first, so an invalid token never reaches a
   * query that would pull a multi-megabyte column.
   */
  private async findReceiptFile(token: string): Promise<{ buffer: Buffer; contentType: string } | null> {
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
    const [claimantsByItem, hasReceipt, flaggedKeys] = await Promise.all([
      Array.isArray(participant.itemIds)
        ? this.countClaimantsByItem(participant.expenseId)
        : Promise.resolve(new Map<string, number>()),
      this.hasReceiptImage(participant.expenseId),
      this.getActiveFlagsForParticipant(participant.id),
    ]);
    const model = this.buildModel(
      { ...participant, claimedAt: claim.count === 1 ? claimedAt : participant.claimedAt },
      payer,
      token,
      claimantsByItem,
      hasReceipt,
      flaggedKeys,
    );
    return renderGuestPage(model, strings);
  }

  /**
   * ABA guest-split-item-dispute. A guest reports that one line (or their
   * whole share) is wrong — see docs/contracts/guest-split-item-dispute.md.
   * Independent of `POST /:token/paid`: a guest may flag and pay in either
   * order, and flagging never blocks or is blocked by payment status.
   *
   * `itemId` is CLAMPED, never trusted: only a value present in this
   * participant's own `itemIds` is honored, so a raw client value can never
   * confirm or deny another participant's item ids on the same receipt — it
   * silently degrades to a whole-share report (`itemId: null`) instead of
   * erroring, preserving the same indistinguishable-failure posture as every
   * other route on this controller.
   *
   * Dedup: at most one OPEN flag per (participantId, itemId) — a repeat
   * submission updates the existing row's note rather than creating a
   * second one and does not re-notify the payer (see the schema comment on
   * `ReceiptSplitFlag` for why this is an app-level check, not a DB unique).
   */
  @Post(':token/flag')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async flagItem(
    @Param('token') token: string,
    @Body() dto: FlagSplitItemDto,
    @Req() req: Request,
  ): Promise<string> {
    const strings = getGuestPageStrings(resolveGuestLang(req));

    const participant = await this.findUsableParticipant(token);
    if (!participant) {
      return renderNotFoundPage(strings);
    }

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
    } else {
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
      // Fire-and-forget, same posture as the split_payment_claimed push above
      // — a failed push must never fail the guest's request. No 5th-arg
      // preference gate, same precedent as account_invitation/
      // split_payment_claimed: a one-off action request, not a recurring
      // alert a user could silence.
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

    const payer = await this.resolvePayer(participant.expense as GuestExpenseView);
    const [claimantsByItem, hasReceipt, flaggedKeys] = await Promise.all([
      Array.isArray(participant.itemIds)
        ? this.countClaimantsByItem(participant.expenseId)
        : Promise.resolve(new Map<string, number>()),
      this.hasReceiptImage(participant.expenseId),
      this.getActiveFlagsForParticipant(participant.id),
    ]);
    return renderGuestPage(
      this.buildModel(participant, payer, token, claimantsByItem, hasReceipt, flaggedKeys),
      strings,
    );
  }
}

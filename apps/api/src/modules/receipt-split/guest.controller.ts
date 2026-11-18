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
import {
  ReceiptSplitGuestService,
  GuestExpenseView,
  GuestParticipantRow,
  GuestPageData,
} from './receipt-split-guest.service';
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
import { FlagSplitItemDto } from './dto';

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
 * The receipt-split guest page (`s/`), one of the app's three public, unauthenticated
 * surfaces — the others are `ShoppingListGuestController` (`sl/`) and `GroupGuestController`
 * (`g/`, ABA-640), each with its own `/api/v1` exclusion. A guest has no account and never
 * will — this page is the entire product experience for them. Treat every line as
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
  constructor(private readonly guestService: ReceiptSplitGuestService) {}

  private buildModel(
    participant: GuestParticipantRow,
    data: GuestPageData,
    token: string,
  ): GuestPageModel {
    const { payer, claimantsByItem, hasReceipt, flaggedKeys } = data;
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

    const participant = await this.guestService.findUsableParticipant(token);
    if (!participant) {
      return renderNotFoundPage(strings);
    }

    await this.guestService.markOpened(participant);

    const data = await this.guestService.loadPageData(participant);
    return renderGuestPage(this.buildModel(participant, data, token), strings);
  }

  /**
   * ABA — QR-code bill split. Names-only picker page for a whole split — see
   * docs/contracts/qr-code-bill-split-api.md. No route-shadow risk against
   * `GET /s/:token`: `:token` is single-segment, these need a static "g" segment
   * plus one or two more.
   */
  @Get('g/:groupToken')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async groupPicker(@Param('groupToken') groupToken: string, @Req() req: Request): Promise<string> {
    const strings = getGuestPageStrings(resolveGuestLang(req));

    const anchor = await this.guestService.findUsableGroupAnchor(groupToken);
    if (!anchor) {
      return renderNotFoundPage(strings);
    }

    const { merchant, siblings } = await this.guestService.getGroupPicker(anchor);

    const lang = resolveGuestLang(req);
    const entries = siblings.map((s) => ({
      name: s.name,
      href: `/s/g/${groupToken}/${s.seq}?lang=${lang}`,
    }));

    return renderGroupPickerPage({ merchant, entries }, strings);
  }

  /**
   * ABA — QR-code bill split. "You are «Name» — is that you?" confirm step
   * reached from the picker page above. `:seq` is a small position index, not a
   * bearer credential — only meaningful scoped by the still-secret `groupToken`.
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

    const anchor = await this.guestService.findUsableGroupAnchor(groupToken);
    const seq = Number(seqParam);
    if (!anchor || !Number.isInteger(seq)) {
      return renderNotFoundPage(strings);
    }

    const sibling = await this.guestService.findGroupSibling(anchor, seq);
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
   * The payer's receipt scan, for the guest whose token this is. Unknown, expired and
   * cancelled tokens all 404, as does a valid token whose expense has no scan, so a
   * 404 never says which. `Content-Type` is sniffed from the bytes (see
   * receipt-content-type.ts), never taken from the stored mime type, and `nosniff`
   * is set on top. The group route above is declared first, so `/s/g/receipt`
   * resolves as a group token.
   */
  @Get(':token/receipt')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async guestReceipt(@Param('token') token: string): Promise<StreamableFile> {
    const file = await this.guestService.findReceiptFile(token);
    if (!file) {
      throw new NotFoundException();
    }
    return new StreamableFile(file.buffer, { type: file.contentType, disposition: 'inline' });
  }

  @Post(':token/paid')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async markPaid(@Param('token') token: string, @Req() req: Request): Promise<string> {
    const strings = getGuestPageStrings(resolveGuestLang(req));

    const participant = await this.guestService.findUsableParticipant(token);
    if (!participant) {
      return renderNotFoundPage(strings);
    }

    const claimedAt = await this.guestService.claimPaid(participant);

    const data = await this.guestService.loadPageData(participant);
    const model = this.buildModel(
      { ...participant, claimedAt: claimedAt ?? participant.claimedAt },
      data,
      token,
    );
    return renderGuestPage(model, strings);
  }

  /**
   * ABA guest-split-item-dispute. Independent of `POST /:token/paid`: a guest may flag
   * and pay in either order. Clamping and dedup rules live in
   * `ReceiptSplitGuestService.flagItem`.
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

    const participant = await this.guestService.findUsableParticipant(token);
    if (!participant) {
      return renderNotFoundPage(strings);
    }

    await this.guestService.flagItem(participant, dto);

    const data = await this.guestService.loadPageData(participant);
    return renderGuestPage(this.buildModel(participant, data, token), strings);
  }
}

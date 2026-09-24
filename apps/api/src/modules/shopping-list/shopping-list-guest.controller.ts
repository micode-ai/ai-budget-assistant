import { Controller, Get, Post, Param, Req, Header, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { renderGuestListPage, renderListNotFoundPage, GuestListPageModel } from './helpers/guest-list-page';
import { getGuestListPageStrings, resolveGuestListLang } from './helpers/guest-list-page-i18n';

/**
 * The public, unauthenticated guest view of one shopping list
 * (shopping-list-guest-share-link) — see
 * docs/contracts/shopping-list-guest-share-link.md. Mirrors the isolation
 * posture of `receipt-split/guest.controller.ts` (the app's other
 * unauthenticated surface): a guest has no account and never will, so treat
 * every line as security-sensitive — never expose accountId, member names,
 * or anything about the account beyond this one list's own item labels.
 *
 * Deliberately only two routes (`GET /:token`, `POST /:token/items/:itemId/toggle`)
 * — no JSON variant, same "unused public read endpoint is attack surface for
 * free" rule `GuestController` states.
 */
@Controller('sl')
export class ShoppingListGuestController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a token to a usable list + its live items, or `null` for an
   * unknown token, a revoked one (guestToken no longer matches anything), or
   * one whose list is now archived/deleted. All collapse to the same `null`
   * — never confirm to an outside visitor that a link *used to* work.
   *
   * Single query (unlike `GuestController.findUsableParticipant`'s
   * deliberate two-query split): that split exists to keep a receipt split's
   * "is this link dead" from being a timing oracle on a page that carries
   * payment-status signal. A shopping-list guest link protects no money and
   * no other-party financial data — the worst a timing difference could
   * reveal here is "a token existed at some point," which isn't sensitive.
   */
  private async findUsableList(token: string) {
    return this.prisma.shoppingList.findFirst({
      where: { guestToken: token, isDeleted: false, isArchived: false },
      select: {
        id: true,
        name: true,
        items: {
          where: { isDeleted: false },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, rawLabel: true, quantity: true, isChecked: true },
        },
      },
    });
  }

  private buildModel(list: { id: string; name: string; items: { id: string; rawLabel: string; quantity: unknown; isChecked: boolean }[] }, token: string): GuestListPageModel {
    return {
      listName: list.name,
      items: list.items.map((item) => ({
        id: item.id,
        rawLabel: item.rawLabel,
        quantity: Number(item.quantity),
        isChecked: item.isChecked,
      })),
      toggleActionBase: `/sl/${token}/items`,
    };
  }

  @Get(':token')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  // No amounts, no member names — nothing on this page rises to the level of
  // the receipt-split guest page's `no-store`, but it's still a public link
  // someone else could be handed after us on a shared device, so keep the
  // same posture: no caching.
  @Header('Cache-Control', 'no-store')
  async guestPage(@Param('token') token: string, @Req() req: Request): Promise<string> {
    const strings = getGuestListPageStrings(resolveGuestListLang(req));
    const list = await this.findUsableList(token);
    if (!list) return renderListNotFoundPage(strings);
    return renderGuestListPage(this.buildModel(list, token), strings);
  }

  /**
   * `itemId` is re-scoped to `shoppingListId: list.id` (never just looked up
   * on its own) — the one IDOR-shaped risk in this feature: a token only
   * proves "you may see and toggle items belonging to THIS list," so a bare
   * itemId from another list must never be honored.
   */
  @Post(':token/items/:itemId/toggle')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async toggleItem(
    @Param('token') token: string,
    @Param('itemId') itemId: string,
    @Req() req: Request,
  ): Promise<string> {
    const strings = getGuestListPageStrings(resolveGuestListLang(req));
    const list = await this.findUsableList(token);
    if (!list) return renderListNotFoundPage(strings);

    const item = list.items.find((i) => i.id === itemId);
    if (item) {
      // Same syncVersion-bump convention as ShoppingListService.updateItem,
      // so a real member's next pull picks up the change through the
      // ordinary REST pull-merge this module already uses — no `/sync`
      // machinery involved. A double-submit toggling twice is harmless (no
      // visible net change), so no extra guard against a repeat POST.
      await this.prisma.shoppingListItem.update({
        where: { id: item.id },
        data: { isChecked: !item.isChecked, syncVersion: { increment: 1 } },
      });
      item.isChecked = !item.isChecked;
    }

    return renderGuestListPage(this.buildModel(list, token), strings);
  }
}

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { applyUnitRate } from '../../common/utils/fx';
import { GroupsService, MAX_SHARES } from './groups.service';
import type { CreateGroupExpenseDto } from './dto';
import {
  BOT_GROUP_DRAFT_TTL_SEC,
  BOT_GROUP_PICKER_MAX,
  botClientRequestId,
  formatBotMoney,
  parseGroupCommand,
  truncateCodePoints,
} from './group-bot';

/** At most this many group commands per user per platform per window; fails closed on a Redis error. */
export const BOT_GROUP_RATE_LIMIT = 20;
export const BOT_GROUP_RATE_WINDOW_MS = 60_000;

/**
 * Adding a group expense from Telegram, WhatsApp or Slack (ABA-658, phase-2 spec item I).
 *
 * One flow for all three bots, no AI call: parse -> (picker) -> confirm card -> Confirm/Cancel. The
 * write goes through `GroupsService.createExpense`, the same path as the app and the guest page; this
 * service never writes a ledger row itself. Defaults are fixed: the payer is the user's own member
 * row and the split is equal among every live member. Anything else is done in the app.
 *
 * Authorization is re-resolved from the database at EVERY step (picker choice, card, confirm): the
 * linked bot identity's `userId` must be a live member of an ACTIVE group. Nothing in the cached draft
 * or the callback data is trusted for that: a callback carries only a draft id and an index into the
 * draft's own candidate list, and the draft is bound to the user who started it.
 *
 * The ACCOUNT viewer role is deliberately NOT applied, unlike every other bot write handler: groups
 * are not account-scoped (spec locked decision 1), exactly as in the app, so a viewer of the bot's
 * default account can still add to a group they belong to.
 */

export type BotT = (key: string, lang?: string, params?: Record<string, string>) => string;

export interface GroupBotPlatform {
  /** `telegram:grp`, `wa:grp` or `slack:grp`: the draft lives under `{keyPrefix}:{draftId}`. */
  keyPrefix: string;
  t: BotT;
  /** Escapes user content (group name, description) for the platform's markup. */
  escape: (s: string) => string;
  /** How the user types the command: `/group` (Telegram) or `group`. */
  command: string;
}

export interface GroupBotCaller {
  userId: string;
  language: string;
}

export interface GroupBotOption {
  index: number;
  label: string;
}

export type GroupBotReply =
  | { kind: 'text'; text: string }
  | { kind: 'picker'; text: string; buttonLabel: string; draftId: string; options: GroupBotOption[] }
  | { kind: 'confirm'; text: string; draftId: string; confirmLabel: string; cancelLabel: string };

export interface GroupBotDraft {
  userId: string;
  amount: number;
  /** Null = the group's own currency. */
  currencyCode: string | null;
  /** Empty = the localized default, decided when the card is shown. */
  description: string;
  /** The platform's own message key (NOT the request id: that is salted with user + group at confirm). */
  messageKey: string;
  /** The groups the picker offered, by index. A callback can only choose among these. */
  candidates: string[];
  groupId: string | null;
}

interface BotGroupRow {
  id: string;
  name: string;
  emoji: string | null;
  currencyCode: string;
}

const errCode = (e: unknown): string | undefined => {
  const r = (e as { getResponse?: () => unknown })?.getResponse?.();
  return r && typeof r === 'object' ? (r as { code?: string }).code : undefined;
};

@Injectable()
export class GroupBotService {
  private readonly logger = new Logger(GroupBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly groups: GroupsService,
  ) {}

  private key(p: GroupBotPlatform, draftId: string): string {
    return `${p.keyPrefix}:${draftId}`;
  }

  /** The user's active groups, most recently active first (ledger writes bump `updatedAt`). */
  async listActiveGroups(userId: string): Promise<BotGroupRow[]> {
    const rows = await this.prisma.expenseGroupMember.findMany({
      where: { userId, removedAt: null, group: { status: 'active' } },
      select: { group: { select: { id: true, name: true, emoji: true, currencyCode: true } } },
      orderBy: { group: { updatedAt: 'desc' } },
      take: BOT_GROUP_PICKER_MAX,
    });
    return rows.map((r: { group: BotGroupRow }) => r.group);
  }

  /** The caller's live membership of an active group, re-read from the database. Null otherwise. */
  private async resolveMembership(userId: string, groupId: string) {
    return this.prisma.expenseGroupMember.findFirst({
      where: { groupId, userId, removedAt: null, group: { status: 'active' } },
      select: { id: true, group: { select: { id: true, name: true, emoji: true, currencyCode: true } } },
    });
  }

  private groupLabel(g: { name: string; emoji: string | null }): string {
    return g.emoji ? `${g.emoji} ${g.name}` : g.name;
  }

  private async loadDraft(p: GroupBotPlatform, caller: GroupBotCaller, draftId: string): Promise<GroupBotDraft | null> {
    if (!/^[a-f0-9]{16}$/.test(draftId)) return null;
    const draft = await this.cache.get<GroupBotDraft>(this.key(p, draftId));
    // A draft is bound to the user who started it: a guessed or forwarded id is just "expired".
    if (!draft || draft.userId !== caller.userId) return null;
    return draft;
  }

  /** Counts one group command; false = over the limit (or Redis down: fail closed). */
  private async withinRateLimit(p: GroupBotPlatform, userId: string): Promise<boolean> {
    try {
      const hits = await this.cache.incrementWindow(`grp:rl:${p.keyPrefix}:${userId}`, BOT_GROUP_RATE_WINDOW_MS);
      return hits <= BOT_GROUP_RATE_LIMIT;
    } catch (e) {
      this.logger.warn(`Group command rate limit unavailable, refusing: ${e}`);
      return false;
    }
  }

  /** One active draft per user per platform: a new command replaces (deletes) the previous draft. */
  private async replaceActiveDraft(p: GroupBotPlatform, userId: string, draftId: string): Promise<void> {
    const pointer = `${p.keyPrefix}:active:${userId}`;
    const previous = await this.cache.get<string>(pointer);
    if (previous && /^[a-f0-9]{16}$/.test(previous)) await this.cache.del(this.key(p, previous));
    await this.cache.set(pointer, draftId, BOT_GROUP_DRAFT_TTL_SEC);
  }

  /** `group <amount> [currency] [description]`. `messageKey` comes from the platform message id. */
  async start(p: GroupBotPlatform, caller: GroupBotCaller, args: string, messageKey: string): Promise<GroupBotReply> {
    const lang = caller.language;
    if (!(await this.withinRateLimit(p, caller.userId))) return { kind: 'text', text: p.t('groupRateLimited', lang) };
    const parsed = args.trim() ? parseGroupCommand(args) : null;
    if (!parsed) return { kind: 'text', text: p.t('groupUsage', lang, { command: p.command }) };

    const groups = await this.listActiveGroups(caller.userId);
    if (groups.length === 0) return { kind: 'text', text: p.t('groupNone', lang) };

    const draftId = randomBytes(8).toString('hex');
    const draft: GroupBotDraft = {
      userId: caller.userId,
      amount: parsed.amount,
      currencyCode: parsed.currencyCode,
      description: parsed.description,
      messageKey,
      candidates: groups.map((g) => g.id),
      groupId: groups.length === 1 ? groups[0].id : null,
    };
    await this.replaceActiveDraft(p, caller.userId, draftId);
    if (draft.groupId) return this.card(p, caller, draftId, draft);

    await this.cache.set(this.key(p, draftId), draft, BOT_GROUP_DRAFT_TTL_SEC);
    return {
      kind: 'picker',
      text: p.t('groupPick', lang),
      buttonLabel: p.t('groupPickButton', lang),
      draftId,
      options: groups.map((g, index) => ({ index, label: this.groupLabel(g) })),
    };
  }

  /** A picker choice. The index is into the draft's OWN candidates, never a group id from the client. */
  async pick(p: GroupBotPlatform, caller: GroupBotCaller, draftId: string, rawIndex: string): Promise<GroupBotReply> {
    const lang = caller.language;
    const draft = await this.loadDraft(p, caller, draftId);
    if (!draft) return { kind: 'text', text: p.t('groupExpired', lang) };
    const index = /^\d{1,2}$/.test(rawIndex) ? Number(rawIndex) : -1;
    const groupId = draft.candidates[index];
    if (!groupId) return { kind: 'text', text: p.t('groupExpired', lang) };
    draft.groupId = groupId;
    return this.card(p, caller, draftId, draft);
  }

  /**
   * Builds the confirm card and writes the (mutated) draft back. The currency is checked here, so an
   * unsupported code or a missing rate is refused before the user is asked to confirm anything.
   */
  private async card(p: GroupBotPlatform, caller: GroupBotCaller, draftId: string, draft: GroupBotDraft): Promise<GroupBotReply> {
    const lang = caller.language;
    const membership = await this.resolveMembership(caller.userId, draft.groupId!);
    if (!membership) {
      await this.cache.del(this.key(p, draftId));
      return { kind: 'text', text: p.t('groupNotAvailable', lang) };
    }
    const group = membership.group;
    const memberCount = await this.prisma.expenseGroupMember.count({ where: { groupId: group.id, removedAt: null } });
    if (memberCount > MAX_SHARES) {
      await this.cache.del(this.key(p, draftId));
      return { kind: 'text', text: p.t('groupOpenInApp', lang) };
    }

    const entryCurrency = draft.currencyCode ?? group.currencyCode;
    let amountText = formatBotMoney(draft.amount, entryCurrency);
    if (entryCurrency !== group.currencyCode) {
      let rate: number | null;
      try {
        rate = (await this.groups.fxPreview(group.id, entryCurrency)).rate;
      } catch (e) {
        if (errCode(e) !== 'CURRENCY_UNSUPPORTED') throw e;
        await this.cache.del(this.key(p, draftId));
        return { kind: 'text', text: p.t('groupCurrencyUnsupported', lang, { currency: entryCurrency }) };
      }
      if (rate === null) {
        await this.cache.del(this.key(p, draftId));
        return { kind: 'text', text: p.t('groupFxUnavailable', lang, { currency: entryCurrency }) };
      }
      // A preview only: the write converts again at confirm time (spec F, rate at entry time).
      amountText = `${amountText} ≈ ${formatBotMoney(applyUnitRate(draft.amount, rate), group.currencyCode)}`;
    }

    // A mutated cached object must be written back: a Redis read is a fresh copy.
    await this.cache.set(this.key(p, draftId), draft, BOT_GROUP_DRAFT_TTL_SEC);
    const description = draft.description || p.t('groupExpenseDefault', lang);
    return {
      kind: 'confirm',
      draftId,
      text: p.t('groupConfirmCard', lang, {
        group: p.escape(this.groupLabel(group)),
        amount: amountText,
        description: p.escape(description),
        count: String(memberCount),
      }),
      confirmLabel: p.t('confirm', lang),
      cancelLabel: p.t('cancel', lang),
    };
  }

  /**
   * Confirm. Membership and the group's status are re-resolved NOW, never trusted from the draft
   * (spec threat 8): a member removed or a group archived since the card was shown is refused. A
   * double tap re-runs with the same `clientRequestId` and lands on the existing dedup.
   */
  async confirm(p: GroupBotPlatform, caller: GroupBotCaller, draftId: string): Promise<GroupBotReply> {
    const lang = caller.language;
    const draft = await this.loadDraft(p, caller, draftId);
    if (!draft || !draft.groupId) return { kind: 'text', text: p.t('groupExpired', lang) };

    const membership = await this.resolveMembership(caller.userId, draft.groupId);
    if (!membership) {
      await this.cache.del(this.key(p, draftId));
      return { kind: 'text', text: p.t('groupNotAvailable', lang) };
    }
    const group = membership.group;
    const members = await this.prisma.expenseGroupMember.findMany({
      where: { groupId: group.id, removedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (members.length > MAX_SHARES) {
      await this.cache.del(this.key(p, draftId));
      return { kind: 'text', text: p.t('groupOpenInApp', lang) };
    }
    const entryCurrency = draft.currencyCode ?? group.currencyCode;
    // Salted with the user and the group: one message id can never create expenses in two groups.
    const clientRequestId = botClientRequestId(p.keyPrefix, draft.messageKey, caller.userId, group.id);
    // A dedup hit must be the caller's own expense; never report someone else's as "Added".
    const prior = await this.prisma.groupExpense.findFirst({
      where: { groupId: group.id, clientRequestId },
      select: { createdByMemberId: true },
    });
    if (prior && prior.createdByMemberId !== membership.id) {
      await this.cache.del(this.key(p, draftId));
      return { kind: 'text', text: p.t('groupNotAvailable', lang) };
    }

    // Built by hand, so the ValidationPipe never ran: the parser bounds the amount (0.01 .. 1 000 000,
    // 2 decimals), the description is cut to the column, and the request id is our own.
    const dto: CreateGroupExpenseDto = {
      clientRequestId,
      description: truncateCodePoints(draft.description || p.t('groupExpenseDefault', lang), 120),
      amount: draft.amount,
      currencyCode: entryCurrency,
      // The server's calendar day (UTC), as every other bot write.
      date: new Date().toISOString().slice(0, 10),
      paidByMemberId: membership.id,
      splitType: 'equal',
      shares: members.map((m: { id: string }) => ({ memberId: m.id })),
    };
    try {
      await this.groups.createExpense(group.id, membership.id, dto);
    } catch (e) {
      const code = errCode(e);
      if (code === 'FX_RATE_UNAVAILABLE') {
        return { kind: 'text', text: p.t('groupFxUnavailable', lang, { currency: entryCurrency }) };
      }
      if (code === 'CURRENCY_UNSUPPORTED') {
        await this.cache.del(this.key(p, draftId));
        return { kind: 'text', text: p.t('groupCurrencyUnsupported', lang, { currency: entryCurrency }) };
      }
      if (e instanceof NotFoundException || code === 'GROUP_ARCHIVED' || e instanceof ForbiddenException) {
        await this.cache.del(this.key(p, draftId));
        return { kind: 'text', text: p.t('groupNotAvailable', lang) };
      }
      if (e instanceof BadRequestException) {
        // EXPENSE_LIMIT, an out-of-range conversion: nothing the bot can fix.
        await this.cache.del(this.key(p, draftId));
        return { kind: 'text', text: p.t('groupOpenInApp', lang) };
      }
      throw e;
    }
    await this.cache.del(this.key(p, draftId));

    const stored = await this.prisma.groupExpense.findFirst({
      where: { groupId: group.id, clientRequestId },
      select: { amount: true },
    });
    let amountText = formatBotMoney(draft.amount, entryCurrency);
    if (entryCurrency !== group.currencyCode && stored) {
      amountText = `${amountText} → ${formatBotMoney(Number(stored.amount), group.currencyCode)}`;
    }
    return { kind: 'text', text: p.t('groupAdded', lang, { group: p.escape(this.groupLabel(group)), amount: amountText }) };
  }

  async cancel(p: GroupBotPlatform, caller: GroupBotCaller, draftId: string): Promise<GroupBotReply> {
    const draft = await this.loadDraft(p, caller, draftId);
    if (!draft) return { kind: 'text', text: p.t('groupExpired', caller.language) };
    await this.cache.del(this.key(p, draftId));
    return { kind: 'text', text: p.t('groupCancelled', caller.language) };
  }
}

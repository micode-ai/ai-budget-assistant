import { BadRequestException, ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { NotificationsService } from '../notifications/notifications.service';
import * as ni18n from '../notifications/notification-i18n';
import {
  candidateKeyOf,
  legKeyOf,
  legSide,
  MIRROR_SUGGEST_DAYS,
  pairKeyOf,
  planCashLinks,
  type CashCandidate,
  type CashLeg,
} from './group-budget-mirror';
import {
  CANDIDATE_ORDER,
  DAY_MS,
  iso,
  LINKABLE_EXPENSE,
  LINKABLE_INCOME,
  MAX_CANDIDATES,
  NOT_A_LIVE_RECEIPT_SPLIT,
  SUGGESTION_PUSH_COALESCE_SECONDS,
  type MirrorMember,
} from './group-budget-mirror.shared';
import type { GroupBudgetMirrorSupport } from './group-budget-mirror.support';
import type {
  CreateGroupCashLinkDto,
  GroupBudgetLinksView,
  GroupCashLegView,
  GroupCashPersonalRowView,
  GroupShareRowView,
} from '@budget/shared-types';

/**
 * Cash-link matching: the two-tier matcher run by every reconcile pass (`syncCashLinks`), the
 * suggestions it leaves, and the routes that link, accept, reject and unlink by hand.
 */
export class GroupBudgetMirrorCashLinks {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly support: GroupBudgetMirrorSupport,
    private readonly logger: Logger,
    private readonly notifications?: NotificationsService,
  ) {}

  /** Drops links whose leg or row is gone, then runs the two tiers over what is still unlinked. */
  async syncCashLinks(m: MirrorMember, account: { id: string }, legs: CashLeg[]): Promise<boolean> {
    let changed = false;
    const legMap = new Map(legs.map((l) => [l.key, l]));
    const links = await this.prisma.groupCashLink.findMany({
      where: { memberId: m.id },
      select: {
        id: true,
        legKey: true,
        expenseId: true,
        incomeId: true,
        expense: { select: { isDeleted: true, accountId: true } },
        income: { select: { isDeleted: true, accountId: true } },
      },
    });
    const linked = new Set<string>();
    for (const link of links ?? []) {
      const row = link.expense ?? link.income;
      const stale = !legMap.has(link.legKey) || !row || row.isDeleted || row.accountId !== account.id;
      if (!stale) {
        linked.add(link.legKey);
        continue;
      }
      await this.prisma.$transaction(async (tx: any) => {
        await tx.groupCashLink.deleteMany({ where: { id: link.id } });
        // Back to an ordinary counted row, but only in the mirror's own account (writable, checked above).
        if (link.expenseId) {
          await tx.expense.updateMany({
            where: { id: link.expenseId, accountId: account.id, isSplitReceivable: true, ...NOT_A_LIVE_RECEIPT_SPLIT },
            data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
          });
        }
        if (link.incomeId) {
          await tx.income.updateMany({
            where: { id: link.incomeId, accountId: account.id, isSplitReceivable: true },
            data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
          });
        }
      });
      changed = true;
    }

    const unlinked = legs.filter((l) => !linked.has(l.key));
    const openSuggestions = await this.prisma.groupCashSuggestion.findMany({
      where: { memberId: m.id, status: 'open' },
      select: { id: true, legKey: true, candidateKey: true },
    });
    if (!unlinked.length) {
      if (openSuggestions?.length) {
        await this.prisma.groupCashSuggestion.deleteMany({ where: { memberId: m.id, status: 'open' } });
      }
      return changed;
    }

    const candidates = await this.loadCandidates(m, account.id, unlinked);
    const rejected = await this.prisma.groupCashSuggestion.findMany({
      where: { memberId: m.id, status: 'rejected' },
      select: { legKey: true, candidateKey: true },
    });
    const plan = planCashLinks(unlinked, candidates, new Set((rejected ?? []).map((r: any) => pairKeyOf(r.legKey, r.candidateKey))));

    const autoLegs = new Set<string>();
    for (const { leg, candidate } of plan.auto) {
      try {
        await this.linkPair(m, account.id, leg, candidate, 'auto');
        autoLegs.add(leg.key);
        changed = true;
      } catch (e) {
        // Lost a race (the row was flagged, linked or deleted meanwhile): the next pass re-plans it.
        this.logger.debug(`auto-link skipped for ${leg.key}: ${(e as Error).message}`);
      }
    }

    const wanted = plan.suggestions.filter((s) => !autoLegs.has(s.leg.key));
    const wantedKeys = new Set(wanted.map((s) => pairKeyOf(s.leg.key, s.candidate.key)));
    const staleIds = (openSuggestions ?? [])
      .filter((s: any) => !wantedKeys.has(pairKeyOf(s.legKey, s.candidateKey)))
      .map((s: any) => s.id);
    if (staleIds.length) await this.prisma.groupCashSuggestion.deleteMany({ where: { id: { in: staleIds } } });
    const have = new Set((openSuggestions ?? []).map((s: any) => pairKeyOf(s.legKey, s.candidateKey)));
    const toCreate = wanted.filter((s) => !have.has(pairKeyOf(s.leg.key, s.candidate.key)));
    if (toCreate.length) {
      await this.prisma.groupCashSuggestion.createMany({
        data: toCreate.map(({ leg, candidate }) => ({
          memberId: m.id,
          kind: leg.kind,
          legKey: leg.key,
          ...this.legRef(leg),
          candidateKey: candidate.key,
          ...(candidate.side === 'expense' ? { expenseId: candidate.id } : { incomeId: candidate.id }),
          status: 'open',
        })),
        skipDuplicates: true,
      });
      // ABA-660 review H1: a payment someone else wrote that may be mine is only ever offered, so tell me.
      if (toCreate.some((t) => !t.leg.authoredByMe)) this.notifyForeignSuggestion(m);
    }
    return changed;
  }

  /** Coalesced, fire-and-forget group_activity push to the mirroring member. Never throws. */
  private notifyForeignSuggestion(m: MirrorMember): void {
    const notifications = this.notifications;
    if (!notifications) return;
    void (async () => {
      if (!(await this.cache.setIfAbsent(`grp:sugg:${m.groupId}:${m.userId}`, SUGGESTION_PUSH_COALESCE_SECONDS))) return;
      await notifications.sendToUser(
        m.userId,
        (lang: string) => ni18n.groupActivityTitle(lang, m.group.name),
        (lang: string) => ni18n.groupActivityBody(lang),
        { groupId: m.groupId },
        'group_activity',
      );
    })().catch(logFireAndForget(this.logger, 'GroupBudgetMirrorService.notifyForeignSuggestion'));
  }

  private legRef(leg: CashLeg) {
    return leg.kind === 'payer_expense' ? { groupExpenseId: leg.refId } : { settlementId: leg.refId };
  }

  private async loadCandidates(m: MirrorMember, accountId: string, legs: CashLeg[]): Promise<CashCandidate[]> {
    const span = (side: 'expense' | 'income') => {
      const mine = legs.filter((l) => legSide(l.kind) === side);
      if (!mine.length) return null;
      const t = mine.map((l) => l.date.getTime());
      return {
        currencies: [...new Set(mine.map((l) => l.currencyCode))],
        gte: new Date(Math.min(...t) - MIRROR_SUGGEST_DAYS * DAY_MS),
        lte: new Date(Math.max(...t) + MIRROR_SUGGEST_DAYS * DAY_MS),
      };
    };
    const ex = span('expense');
    const inc = span('income');
    const select = { id: true, amount: true, currencyCode: true, date: true } as const;
    const [expenses, incomes] = await Promise.all([
      ex
        ? this.prisma.expense.findMany({
            where: {
              accountId,
              userId: m.userId,
              ...LINKABLE_EXPENSE,
              currencyCode: { in: ex.currencies },
              date: { gte: ex.gte, lte: ex.lte },
            },
            select,
            orderBy: CANDIDATE_ORDER,
            take: MAX_CANDIDATES,
          })
        : Promise.resolve([]),
      inc
        ? this.prisma.income.findMany({
            where: {
              accountId,
              userId: m.userId,
              ...LINKABLE_INCOME,
              currencyCode: { in: inc.currencies },
              date: { gte: inc.gte, lte: inc.lte },
            },
            select,
            orderBy: CANDIDATE_ORDER,
            take: MAX_CANDIDATES,
          })
        : Promise.resolve([]),
    ]);
    const toCandidate = (side: 'expense' | 'income') => (r: any): CashCandidate => ({
      key: candidateKeyOf(side, r.id),
      side,
      id: r.id,
      amount: Number(r.amount),
      currencyCode: r.currencyCode,
      date: new Date(r.date),
    });
    return [...(expenses ?? []).map(toCandidate('expense')), ...(incomes ?? []).map(toCandidate('income'))];
  }

  /**
   * Link one leg to one row and flag the row, in one transaction. The flag is a CAS on the row still
   * being linkable (re-scoped to my user and the mirror's account), so a row that was flagged, deleted,
   * split or linked meanwhile is refused instead of being linked twice.
   */
  private async linkPair(
    m: MirrorMember,
    accountId: string,
    leg: CashLeg,
    candidate: { side: 'expense' | 'income'; id: string; key: string },
    origin: 'auto' | 'user',
  ): Promise<void> {
    // Defence in depth for H1: an automatic link is only ever for a leg the member wrote themself.
    if (origin === 'auto' && !leg.authoredByMe) {
      throw new ConflictException({ code: 'LEG_NOT_AUTHORED', message: 'Only a suggestion for a payment someone else added' });
    }
    await this.prisma.$transaction(async (tx: any) => {
      const flagged =
        candidate.side === 'expense'
          ? await tx.expense.updateMany({
              where: { id: candidate.id, accountId, userId: m.userId, ...LINKABLE_EXPENSE },
              data: { isSplitReceivable: true, syncVersion: { increment: 1 } },
            })
          : await tx.income.updateMany({
              where: { id: candidate.id, accountId, userId: m.userId, ...LINKABLE_INCOME },
              data: { isSplitReceivable: true, syncVersion: { increment: 1 } },
            });
      if (flagged.count !== 1) {
        throw new ConflictException({ code: 'ROW_NOT_LINKABLE', message: 'That transaction cannot be linked' });
      }
      await tx.groupCashLink.create({
        data: {
          memberId: m.id,
          kind: leg.kind,
          legKey: leg.key,
          ...this.legRef(leg),
          ...(candidate.side === 'expense' ? { expenseId: candidate.id } : { incomeId: candidate.id }),
          origin,
        },
      });
      // The leg and the row are spoken for: their other open suggestions go.
      await tx.groupCashSuggestion.deleteMany({
        where: { memberId: m.id, status: 'open', OR: [{ legKey: leg.key }, { candidateKey: candidate.key }] },
      });
    });
  }

  async getLinks(groupId: string, memberId: string, userId: string): Promise<GroupBudgetLinksView> {
    const mirror = await this.support.viewOf(groupId, memberId, userId);
    const m = await this.support.mirrorMember(memberId);
    if (!m || m.groupId !== groupId || m.userId !== userId) return { mirror, links: [], suggestions: [], unlinked: [] };
    // ABA-660 review M4: while paused (viewer, encrypted, archived, no longer a member) the mirror's
    // account is not shown to me any more, so no personal row of it is returned, only the status.
    if (mirror.status !== 'active') return { mirror, links: [], suggestions: [], unlinked: [], shareRows: [] };
    const { legs, labels, expenses: groupExpenses } = await this.support.loadLegs(m);
    const legView = (l: CashLeg): GroupCashLegView => ({
      kind: l.kind,
      groupExpenseId: l.kind === 'payer_expense' ? l.refId : null,
      settlementId: l.kind === 'payer_expense' ? null : l.refId,
      label: labels.get(l.key) ?? '',
      amount: l.amount,
      currencyCode: l.currencyCode,
      date: iso(l.date),
      addedByOther: !l.authoredByMe,
      addedByName: l.authoredByMe ? null : l.addedByName ?? null,
    });
    const legMap = new Map(legs.map((l) => [l.key, l]));
    const rowSelect = { id: true, amount: true, currencyCode: true, date: true, description: true, isDeleted: true, accountId: true } as const;
    const [links, suggestions] = await Promise.all([
      this.prisma.groupCashLink.findMany({
        where: { memberId: m.id },
        select: {
          id: true,
          legKey: true,
          origin: true,
          expense: { select: { ...rowSelect, merchant: true, source: true } },
          income: { select: { ...rowSelect, source: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.groupCashSuggestion.findMany({
        where: { memberId: m.id, status: 'open' },
        select: {
          id: true,
          legKey: true,
          expense: { select: { ...rowSelect, merchant: true, source: true, isSplitReceivable: true } },
          income: { select: { ...rowSelect, source: true, isSplitReceivable: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const personal = (e: any, i: any): GroupCashPersonalRowView | null => {
      const r = e ?? i;
      if (!r || r.isDeleted || r.accountId !== m.budgetAccountId) return null;
      return {
        expenseId: e ? e.id : null,
        incomeId: e ? null : i.id,
        amount: Number(r.amount),
        currencyCode: r.currencyCode,
        date: iso(r.date),
        description: r.description ?? null,
        merchant: e ? e.merchant ?? null : null,
        source: r.source,
      };
    };
    const linkViews = [];
    const linked = new Set<string>();
    for (const l of links ?? []) {
      const leg = legMap.get(l.legKey);
      const p = personal(l.expense, l.income);
      if (!leg || !p) continue; // stale: the next pass drops it
      linked.add(l.legKey);
      linkViews.push({ id: l.id, origin: l.origin, leg: legView(leg), personal: p });
    }
    const suggestionViews = [];
    for (const s of suggestions ?? []) {
      const leg = legMap.get(s.legKey);
      const p = personal(s.expense, s.income);
      if (!leg || !p || linked.has(s.legKey) || (s.expense ?? s.income)?.isSplitReceivable) continue;
      suggestionViews.push({ id: s.id, leg: legView(leg), personal: p });
    }
    // Share rows that came from an expense someone else added: the app shows "added by <name>".
    const foreign = new Map(groupExpenses.filter((e) => !e.addedByMe).map((e) => [e.id, e]));
    let shareRows: GroupShareRowView[] = [];
    if (foreign.size) {
      const rows = await this.prisma.expense.findMany({
        where: { groupMemberId: m.id, accountId: m.budgetAccountId, isDeleted: false, groupExpenseId: { in: [...foreign.keys()] } },
        select: { id: true, groupExpenseId: true, amount: true, currencyCode: true },
      });
      shareRows = (rows ?? []).map((r: any) => ({
        expenseId: r.id,
        groupExpenseId: r.groupExpenseId,
        amount: Number(r.amount),
        currencyCode: r.currencyCode,
        addedByOther: true,
        addedByName: foreign.get(r.groupExpenseId)?.addedByName ?? null,
      }));
    }
    return {
      mirror,
      links: linkViews,
      suggestions: suggestionViews,
      unlinked: legs.filter((l) => !linked.has(l.key)).map(legView),
      shareRows,
    };
  }

  /** POST /groups/:groupId/budget-links: link a leg of mine to a row of mine by hand. */
  async createLink(groupId: string, memberId: string, userId: string, dto: CreateGroupCashLinkDto): Promise<GroupBudgetLinksView> {
    const m = await this.support.writableMirror(groupId, memberId, userId);
    const refId = dto.kind === 'payer_expense' ? dto.groupExpenseId : dto.settlementId;
    const side = legSide(dto.kind);
    const rowId = side === 'expense' ? dto.expenseId : dto.incomeId;
    const wrongShape =
      !refId ||
      !rowId ||
      (dto.kind === 'payer_expense' ? dto.settlementId : dto.groupExpenseId) !== undefined ||
      (side === 'expense' ? dto.incomeId : dto.expenseId) !== undefined;
    if (wrongShape) throw new BadRequestException({ code: 'LINK_INVALID', message: 'That link does not fit this kind of payment' });
    await this.linkByHand(m, legKeyOf(dto.kind, refId as string), { side, id: rowId as string });
    return this.getLinks(groupId, memberId, userId);
  }

  /** POST .../budget-links/suggestions/:suggestionId/accept */
  async acceptSuggestion(groupId: string, memberId: string, userId: string, suggestionId: string): Promise<GroupBudgetLinksView> {
    const m = await this.support.writableMirror(groupId, memberId, userId);
    const s = await this.prisma.groupCashSuggestion.findFirst({
      where: { id: suggestionId, memberId: m.id, status: 'open' },
      select: { legKey: true, expenseId: true, incomeId: true },
    });
    if (!s) throw new NotFoundException({ code: 'SUGGESTION_NOT_FOUND', message: 'Suggestion not found' });
    await this.linkByHand(m, s.legKey, s.expenseId ? { side: 'expense', id: s.expenseId } : { side: 'income', id: s.incomeId as string });
    return this.getLinks(groupId, memberId, userId);
  }

  /** POST .../budget-links/suggestions/:suggestionId/reject: never offered or auto-linked again. */
  async rejectSuggestion(groupId: string, memberId: string, userId: string, suggestionId: string): Promise<GroupBudgetLinksView> {
    const m = await this.support.mirrorMember(memberId);
    if (!m || m.groupId !== groupId || m.userId !== userId) {
      throw new ConflictException({ code: 'MIRROR_OFF', message: 'Count my share in my budget is off for this group' });
    }
    const r = await this.prisma.groupCashSuggestion.updateMany({
      where: { id: suggestionId, memberId: m.id, status: 'open' },
      data: { status: 'rejected' },
    });
    if (r.count !== 1) throw new NotFoundException({ code: 'SUGGESTION_NOT_FOUND', message: 'Suggestion not found' });
    return this.getLinks(groupId, memberId, userId);
  }

  /**
   * DELETE .../budget-links/:linkId: the row counts again, and the pair is recorded as rejected so the
   * matcher never auto-links it back (an undo must stick).
   */
  async unlink(groupId: string, memberId: string, userId: string, linkId: string): Promise<GroupBudgetLinksView> {
    const m = await this.support.writableMirror(groupId, memberId, userId);
    const link = await this.prisma.groupCashLink.findFirst({
      where: { id: linkId, memberId: m.id },
      select: { id: true, kind: true, legKey: true, groupExpenseId: true, settlementId: true, expenseId: true, incomeId: true },
    });
    if (!link) throw new NotFoundException({ code: 'LINK_NOT_FOUND', message: 'Link not found' });
    const candidateKey = link.expenseId ? candidateKeyOf('expense', link.expenseId) : candidateKeyOf('income', link.incomeId as string);
    await this.prisma.$transaction(async (tx: any) => {
      await tx.groupCashLink.deleteMany({ where: { id: link.id } });
      if (link.expenseId) {
        await tx.expense.updateMany({
          where: { id: link.expenseId, accountId: m.budgetAccountId, userId, isSplitReceivable: true, ...NOT_A_LIVE_RECEIPT_SPLIT },
          data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
        });
      } else if (link.incomeId) {
        await tx.income.updateMany({
          where: { id: link.incomeId, accountId: m.budgetAccountId, userId, isSplitReceivable: true },
          data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
        });
      }
      await tx.groupCashSuggestion.upsert({
        where: { memberId_legKey_candidateKey: { memberId: m.id, legKey: link.legKey, candidateKey } },
        create: {
          memberId: m.id,
          kind: link.kind,
          legKey: link.legKey,
          groupExpenseId: link.groupExpenseId,
          settlementId: link.settlementId,
          candidateKey,
          expenseId: link.expenseId,
          incomeId: link.incomeId,
          status: 'rejected',
        },
        update: { status: 'rejected' },
      });
    });
    this.support.bustCaches(m.budgetAccountId);
    return this.getLinks(groupId, memberId, userId);
  }

  /** Shared by the manual link and an accepted suggestion: both ids re-scoped, then `linkPair`. */
  private async linkByHand(m: MirrorMember, legKey: string, row: { side: 'expense' | 'income'; id: string }): Promise<void> {
    const { legs } = await this.support.loadLegs(m);
    const leg = legs.find((l) => l.key === legKey);
    // A leg is only ever one of MY live movements in THIS group, inside the mirrored window.
    if (!leg || legSide(leg.kind) !== row.side) throw new NotFoundException({ code: 'LEG_NOT_FOUND', message: 'Payment not found' });
    const taken = await this.prisma.groupCashLink.findFirst({ where: { memberId: m.id, legKey }, select: { id: true } });
    if (taken) throw new ConflictException({ code: 'LEG_ALREADY_LINKED', message: 'That payment is already linked' });
    // Re-scoped to {me, the mirror's account}: a foreign or other-account id is a 404, never a link.
    const found =
      row.side === 'expense'
        ? await this.prisma.expense.findFirst({ where: { id: row.id, userId: m.userId, accountId: m.budgetAccountId, isDeleted: false }, select: { id: true } })
        : await this.prisma.income.findFirst({ where: { id: row.id, userId: m.userId, accountId: m.budgetAccountId, isDeleted: false }, select: { id: true } });
    if (!found) throw new NotFoundException({ code: 'ROW_NOT_FOUND', message: 'Transaction not found' });
    const candidateKey = candidateKeyOf(row.side, row.id);
    await this.linkPair(m, m.budgetAccountId, leg, { side: row.side, id: row.id, key: candidateKey }, 'user');
    // An explicit link overrides an earlier "not this one".
    await this.prisma.groupCashSuggestion.deleteMany({ where: { memberId: m.id, legKey, candidateKey } });
    this.support.bustCaches(m.budgetAccountId);
  }
}

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { GroupFxService } from './group-fx.service';
import {
  claimWindowEnd,
  computeItemizedShares,
  validateItemLines,
  type ClaimRow,
  type ItemRow,
  type LinesRejection,
} from './group-items';
import { CreateGroupExpenseDto, GroupExpenseItemInputDto, UpdateGroupExpenseDto } from './dto';
import type { GroupLedgerPorts } from './group-ledger-ports';
import { isP2002, toDateOnly } from './group-util';
import type { GroupDetail } from '@budget/shared-types';

type GroupExpenseRow = Prisma.GroupExpenseGetPayload<object>;
type GroupExpenseItemRow = Prisma.GroupExpenseItemGetPayload<object>;

/**
 * Itemised group expenses (ABA-655): create, plan and edit an expense whose shares are the result of
 * per-line claims. The claim writes themselves live in GroupItemsService. Built by GroupsService, which
 * stays the facade the controllers inject, and handed the ledger primitives it owns through `groups`
 * (GroupItemsService injects GroupsService, so a provider here would be a cycle).
 */
export class GroupItemizedExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupLedgerPorts,
    private readonly fx: GroupFxService,
  ) {}

  private linesRejected(reason: LinesRejection): BadRequestException {
    return new BadRequestException({
      code: 'ITEMS_INVALID',
      reason,
      message: 'The line items do not fit the amount paid',
    });
  }

  /**
   * An itemised expense: lines (entry currency), no claims yet, so the payer holds the whole amount
   * until people claim. Claims are open for CLAIM_WINDOW_DAYS. Stored as an exact split with the
   * resolved shares, so the ledger reads it like any other expense.
   */
  async create(groupId: string, actorId: string, dto: CreateGroupExpenseDto): Promise<GroupDetail> {
    if (dto.splitType !== undefined || dto.shares !== undefined) {
      throw new BadRequestException({ code: 'EXPENSE_ITEMIZED', message: 'An itemised expense is split by its claims' });
    }
    const items = dto.items as GroupExpenseItemInputDto[];
    if (items.some((i) => i.id !== undefined)) throw new BadRequestException('New lines carry no id');
    await this.groups.assertLiveMembers(groupId, [dto.paidByMemberId]);
    const groupCurrency = await this.fx.groupCurrencyOf(groupId);
    const conv = await this.fx.convertEntry(dto.amount, dto.currencyCode ?? groupCurrency, groupCurrency, dto.fxRate);
    const billTotal = conv.fx.originalAmount ?? conv.amount;
    const discountAmount = dto.discountAmount ? dto.discountAmount : null;
    const bad = validateItemLines(items, billTotal, discountAmount);
    if (bad) throw this.linesRejected(bad);

    const rows: (ItemRow & { name: string; position: number })[] = items.map((i, position) => ({
      id: randomUUID(),
      name: i.name,
      totalPrice: i.totalPrice,
      lineDiscount: i.lineDiscount ? i.lineDiscount : null,
      position,
    }));
    const shares = computeItemizedShares(
      { amount: conv.amount, originalAmount: conv.fx.originalAmount, discountAmount, paidByMemberId: dto.paidByMemberId },
      rows,
      [],
    );
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await this.groups.lockGroup(tx, groupId);
        await this.groups.assertLiveMembers(groupId, [dto.paidByMemberId], tx);
        await tx.groupExpense.create({
          data: {
            groupId,
            description: dto.description,
            amount: conv.amount,
            ...conv.fx,
            date: toDateOnly(dto.date),
            paidByMemberId: dto.paidByMemberId,
            splitType: 'exact',
            createdByMemberId: actorId,
            clientRequestId: dto.clientRequestId,
            itemized: true,
            discountAmount,
            claimsOpenUntil: claimWindowEnd(now),
            items: {
              create: rows.map((r) => ({
                id: r.id,
                name: r.name,
                totalPrice: r.totalPrice,
                lineDiscount: r.lineDiscount,
                position: r.position,
              })),
            },
            shares: {
              create: shares.map((s) => ({ memberId: s.memberId, shareValue: s.shareValue, shareAmount: s.shareAmount })),
            },
          },
        });
        });
    } catch (e) {
      if (isP2002(e)) return this.groups.getDetail(groupId, actorId);
      throw e;
    }
    this.groups.notifyActivity(groupId, actorId);
    this.groups.afterLedgerWrite(groupId);
    return this.groups.getDetail(groupId, actorId);
  }

  /** The figures, lines and payer of an itemised edit, derived from `expense` and its stored lines. */
  private async planItemizedUpdate(groupId: string, expense: GroupExpenseRow, storedItems: GroupExpenseItemRow[], dto: UpdateGroupExpenseDto) {
    const paidBy: string = dto.paidByMemberId ?? expense.paidByMemberId;
    const { amount, originalAmount, fxData } = await this.fx.resolveEditFigures(groupId, expense, dto);
    const discountAmount =
      dto.discountAmount !== undefined
        ? dto.discountAmount || null
        : expense.discountAmount == null
          ? null
          : Number(expense.discountAmount);

    const storedIds = new Set<string>(storedItems.map((i) => i.id));
    let next: (ItemRow & { name: string; position: number; isNew: boolean })[];
    if (dto.items !== undefined) {
      const seen = new Set<string>();
      for (const i of dto.items) {
        if (i.id === undefined) continue;
        // Re-scoped: a line id from another expense (or group) is not this expense's line.
        if (!storedIds.has(i.id) || seen.has(i.id)) throw new NotFoundException('Item not found');
        seen.add(i.id);
      }
      next = dto.items.map((i, position) => ({
        id: i.id ?? randomUUID(),
        name: i.name,
        totalPrice: i.totalPrice,
        lineDiscount: i.lineDiscount ? i.lineDiscount : null,
        position,
        isNew: i.id === undefined,
      }));
    } else {
      next = storedItems.map((i) => ({
        id: i.id,
        name: i.name,
        totalPrice: Number(i.totalPrice),
        lineDiscount: i.lineDiscount == null ? null : Number(i.lineDiscount),
        position: i.position,
        isNew: false,
      }));
    }
    const bad = validateItemLines(next, originalAmount ?? amount, discountAmount);
    if (bad) throw this.linesRejected(bad);
    const keptIds = next.filter((i) => !i.isNew).map((i) => i.id);
    const removedIds = [...storedIds].filter((id) => !keptIds.includes(id));
    return { paidBy, amount, originalAmount, fxData, discountAmount, next, keptIds, removedIds };
  }

  /**
   * Edits an itemised expense (creator, payer or owner: the caller checked). `splitType`/`shares` are
   * refused: the shares are the claims' result. Figures follow the ABA-654 edit rule. `items` replaces
   * the line list (an `id` keeps a line and its claims, a missing line is deleted and its claims go
   * with it, which prunes stale claims in storage). The shares are re-derived from the claims inside
   * the same transaction that bumps `ledgerVersion`, after taking the expense row's lock.
   */
  async update(
    groupId: string,
    actorId: string,
    expense: GroupExpenseRow,
    dto: UpdateGroupExpenseDto,
  ): Promise<GroupDetail> {
    if (dto.splitType !== undefined || dto.shares !== undefined) {
      throw new BadRequestException({ code: 'EXPENSE_ITEMIZED', message: 'An itemised expense is split by its claims' });
    }
    const paidBy = dto.paidByMemberId ?? expense.paidByMemberId;
    if (dto.paidByMemberId !== undefined) await this.groups.assertLiveMembers(groupId, [paidBy]);

    // Planned once outside the transaction so a bad request fails before any lock is taken, then
    // planned AGAIN from the row as it is under the lock (ABA-655 review M4).
    const loadItems = (db: Prisma.TransactionClient): Promise<GroupExpenseItemRow[]> =>
      db.groupExpenseItem.findMany({ where: { groupExpenseId: expense.id }, orderBy: { position: 'asc' } });
    await this.planItemizedUpdate(groupId, expense, await loadItems(this.prisma), dto);


    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // The group row's lock first (the member merge and every other ledger write), then the expense
      // row's, so a concurrent claim change serialises behind this edit.
      await this.groups.lockGroup(tx, groupId);
      await tx.groupExpense.update({ where: { id: expense.id }, data: { updatedAt: new Date() } });
      // Re-read under the lock: a delete (or any edit) that committed while we waited must win. A
      // deleted expense is a 404 here, never revived by this write, and the figures, lines and
      // payer are all re-derived from this fresh row and its stored lines.
      const fresh = await tx.groupExpense.findFirst({
        where: { id: expense.id, groupId, deletedAt: null, itemized: true },
      });
      if (!fresh) throw new NotFoundException('Expense not found');
      const { paidBy, amount, originalAmount, fxData, discountAmount, next, keptIds, removedIds } = await this.planItemizedUpdate(
        groupId,
        fresh,
        await loadItems(tx),
        dto,
      );
      // The payer is re-checked under the lock even when the edit does not name one: a merge or removal
      // that committed while we waited must not leave the expense paid by a soft-removed member.
      await this.groups.assertLiveMembers(groupId, [paidBy], tx);
      if (removedIds.length) {
        // Cascades the lines' claims: stale claims are pruned in storage, not only in the recompute.
        await tx.groupExpenseItem.deleteMany({ where: { id: { in: removedIds }, groupExpenseId: expense.id } });
      }
      if (dto.items !== undefined) {
        for (const i of next) {
          const data = { name: i.name, totalPrice: i.totalPrice, lineDiscount: i.lineDiscount ?? null, position: i.position };
          if (i.isNew) await tx.groupExpenseItem.create({ data: { id: i.id, groupExpenseId: expense.id, ...data } });
          else await tx.groupExpenseItem.update({ where: { id: i.id }, data });
        }
      }
      const claims: ClaimRow[] = keptIds.length
        ? (await tx.groupItemClaim.findMany({ where: { itemId: { in: keptIds } } })).map((c) => ({
            itemId: c.itemId,
            memberId: c.memberId,
            shareBp: c.shareBp ?? null,
          }))
        : [];
      const shares = computeItemizedShares({ amount, originalAmount, discountAmount, paidByMemberId: paidBy }, next, claims);
      await tx.groupExpenseShare.deleteMany({ where: { groupExpenseId: expense.id } });
      await tx.groupExpense.update({
        where: { id: expense.id },
        data: {
          description: dto.description ?? fresh.description,
          amount,
          ...fxData,
          discountAmount,
          date: dto.date ? toDateOnly(dto.date) : fresh.date,
          paidByMemberId: paidBy,
          shares: {
            create: shares.map((s) => ({ memberId: s.memberId, shareValue: s.shareValue, shareAmount: s.shareAmount })),
          },
        },
      });
    });
    this.groups.notifyActivity(groupId, actorId);
    this.groups.afterLedgerWrite(groupId);
    return this.groups.getDetail(groupId, actorId);
  }
}

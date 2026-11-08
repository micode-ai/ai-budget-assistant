import { PrismaService } from '../../database/prisma.service';
import { NOT_A_LIVE_RECEIPT_SPLIT } from './group-budget-mirror.shared';
import type { GroupBudgetMirrorSupport } from './group-budget-mirror.support';

/**
 * Removing a member's mirror (opt-out, leave, removal, merge, group delete). Every method takes the
 * caller's transaction client, so a teardown commits or rolls back with the write that triggered it.
 */
export class GroupBudgetMirrorTeardown {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: GroupBudgetMirrorSupport,
  ) {}

  /** Every mirror in a group, before the group is hard-deleted (the ledger rows go with it). */
  async teardownGroup(tx: any, groupId: string): Promise<void> {
    const members = await tx.expenseGroupMember.findMany({
      where: { groupId, userId: { not: null }, budgetAccountId: { not: null } },
      select: { id: true, userId: true, budgetAccountId: true },
    });
    for (const m of members) await this.teardown(tx, m.id, m.userId, m.budgetAccountId);
  }

  /**
   * ABA-660 review H2: called inside the transaction that sets `removedAt` (leave, owner removal), so a
   * removed member's share rows and flagged legs never outlive them. A no-op for a member with no
   * mirror (and for a guest row, which has no user to mirror for).
   */
  async teardownMember(tx: any, memberId: string): Promise<void> {
    const m = await tx.expenseGroupMember.findFirst({
      where: { id: memberId },
      select: { id: true, userId: true, budgetAccountId: true, budgetMirrorFrom: true },
    });
    if (!m || !m.userId || !m.budgetAccountId) return;
    await this.teardown(tx, m.id, m.userId, m.budgetAccountId);
    await tx.expenseGroupMember.update({
      where: { id: m.id },
      data: { budgetMirrorFrom: null, budgetAccountId: null, budgetCategoryId: null },
    });
  }

  /**
   * Never leaves an `isSplitReceivable` row without a link behind it (ABA-660 review M1). The flag is
   * cleared without the "account is writable" check, since clearing only restores a row to "counted";
   * it is cleared only on rows a mirror link names (so only ones the mirror itself flagged) and never
   * on a receipt with live split participants (L2). Share rows are removed when the user is still a
   * member of the account (any role: they are the mirror's own rows); when they are not, those rows
   * are left alone, the flags are cleared and the links dropped.
   */
  async teardown(tx: any, memberId: string, userId: string, accountId: string): Promise<void> {
    const acct = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, members: { where: { userId }, select: { role: true } } },
    });
    const stillMember = !!acct?.members?.length;
    if (stillMember) {
      await tx.expense.updateMany({
        where: { groupMemberId: memberId, accountId, isDeleted: false },
        data: { isDeleted: true, groupExpenseId: null, groupMemberId: null, groupShareAmount: null, syncVersion: { increment: 1 } },
      });
      // The rows the user had deleted themselves: detached, so a later opt-in starts clean.
      await tx.expense.updateMany({
        where: { groupMemberId: memberId, accountId },
        data: { groupExpenseId: null, groupMemberId: null, groupShareAmount: null },
      });
    }
    const links = await tx.groupCashLink.findMany({ where: { memberId }, select: { expenseId: true, incomeId: true } });
    const expenseIds = links.map((l: any) => l.expenseId).filter(Boolean);
    const incomeIds = links.map((l: any) => l.incomeId).filter(Boolean);
    if (expenseIds.length) {
      await tx.expense.updateMany({
        where: { id: { in: expenseIds }, userId, isSplitReceivable: true, ...NOT_A_LIVE_RECEIPT_SPLIT },
        data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
      });
    }
    if (incomeIds.length) {
      await tx.income.updateMany({
        where: { id: { in: incomeIds }, userId, isSplitReceivable: true },
        data: { isSplitReceivable: false, syncVersion: { increment: 1 } },
      });
    }
    await tx.groupCashLink.deleteMany({ where: { memberId } });
    await tx.groupCashSuggestion.deleteMany({ where: { memberId } });
    this.support.bustCaches(accountId);
  }
}

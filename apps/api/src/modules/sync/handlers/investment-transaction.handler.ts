import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processInvestmentTransactionChange(
  ctx: SyncHandlerContext,
  accountId: string,
  userId: string,
  change: Extract<SyncChange, { entityType: 'investment_transaction' }>,
): Promise<SyncResult> {
  const { payload } = change;

  if (change.operation === 'create') {
    const holding = await ctx.prisma.portfolioHolding.findFirst({
      where: { OR: [{ id: payload.holdingId }, { clientId: payload.holdingId }], accountId },
    });
    if (!holding) return { entityId: change.entityId, status: 'error', error: 'Holding not found' };

    const quantity = Number(payload.quantity);
    const pricePerUnit = Number(payload.pricePerUnit);
    const fee = Number(payload.fee) || 0;
    const totalAmount = quantity * pricePerUnit + (payload.type === 'buy' ? fee : -fee);

    const tx = await ctx.prisma.investmentTransaction.upsert({
      where: { accountId_clientId: { accountId, clientId: payload.localId || change.entityId } },
      create: {
        accountId,
        userId,
        clientId: payload.localId || change.entityId,
        holdingId: holding.id,
        type: payload.type,
        quantity,
        pricePerUnit,
        totalAmount,
        fee,
        date: new Date(payload.date),
        notes: payload.notes,
      },
      update: { isDeleted: false },
    });
    return { entityId: change.entityId, status: 'success', serverId: tx.id, serverVersion: tx.syncVersion };
  }
  if (change.operation === 'delete') {
    await ctx.prisma.investmentTransaction.updateMany({
      where: { clientId: change.entityId, accountId },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    return { entityId: change.entityId, status: 'success' };
  }
  return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
}

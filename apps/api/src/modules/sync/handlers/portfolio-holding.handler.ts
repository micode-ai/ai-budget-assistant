import type { SyncChange } from '@budget/shared-types';
import { SyncHandlerContext, SyncResult } from '../sync-types';

export async function processPortfolioHoldingChange(
  ctx: SyncHandlerContext,
  accountId: string,
  userId: string,
  change: Extract<SyncChange, { entityType: 'portfolio_holding' }>,
): Promise<SyncResult> {
  const { payload } = change;

  if (change.operation === 'create') {
    // Find or create asset
    let asset = await ctx.prisma.asset.findFirst({
      where: { symbol: payload.assetSymbol?.toUpperCase(), exchange: payload.assetExchange || null },
    });
    if (!asset) {
      asset = await ctx.prisma.asset.create({
        data: {
          symbol: payload.assetSymbol?.toUpperCase(),
          name: payload.assetName,
          type: payload.assetType,
          exchange: payload.assetExchange,
          priceCurrency: 'USD',
        },
      });
    }
    const holding = await ctx.prisma.portfolioHolding.upsert({
      where: { accountId_clientId: { accountId, clientId: payload.localId || change.entityId } },
      create: {
        accountId,
        userId,
        clientId: payload.localId || change.entityId,
        assetId: asset.id,
        notes: payload.notes,
      },
      update: { isDeleted: false },
    });
    return { entityId: change.entityId, status: 'success', serverId: holding.id, serverVersion: holding.syncVersion };
  }
  if (change.operation === 'delete') {
    await ctx.prisma.portfolioHolding.updateMany({
      where: { clientId: change.entityId, accountId },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });
    return { entityId: change.entityId, status: 'success' };
  }
  return { entityId: change.entityId, status: 'error', error: 'Unknown operation' };
}

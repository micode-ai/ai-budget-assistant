import { executeSql } from './client';
import type { Asset, PortfolioHolding, InvestmentTransaction, AssetType, InvestmentTransactionType, SyncStatus } from '@budget/shared-types';

// ---- Row interfaces ----

interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  type: string;
  exchange: string | null;
  current_price: number | null;
  price_currency: string;
  logo_url: string | null;
  last_price_update: number | null;
  created_at: number;
  updated_at: number;
}

interface HoldingRow {
  id: string;
  local_id: string;
  server_id: string | null;
  account_id: string;
  user_id: string;
  asset_id: string;
  quantity: number;
  average_cost_basis: number;
  total_invested: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

interface TransactionRow {
  id: string;
  local_id: string;
  server_id: string | null;
  holding_id: string;
  account_id: string;
  user_id: string;
  type: string;
  quantity: number;
  price_per_unit: number;
  total_amount: number;
  fee: number;
  date: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
  is_deleted: number;
  sync_status: string;
  sync_version: number;
}

// ---- Row mappers ----

function rowToAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    type: row.type as AssetType,
    exchange: row.exchange ?? undefined,
    currentPrice: row.current_price ?? undefined,
    priceCurrency: row.price_currency,
    logoUrl: row.logo_url ?? undefined,
    lastPriceUpdate: row.last_price_update ? new Date(row.last_price_update) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToHolding(row: HoldingRow): PortfolioHolding {
  return {
    id: row.id,
    localId: row.local_id,
    serverId: row.server_id ?? undefined,
    accountId: row.account_id,
    userId: row.user_id,
    assetId: row.asset_id,
    quantity: row.quantity,
    averageCostBasis: row.average_cost_basis,
    totalInvested: row.total_invested,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

function rowToTransaction(row: TransactionRow): InvestmentTransaction {
  return {
    id: row.id,
    localId: row.local_id,
    serverId: row.server_id ?? undefined,
    holdingId: row.holding_id,
    accountId: row.account_id,
    userId: row.user_id,
    type: row.type as InvestmentTransactionType,
    quantity: row.quantity,
    pricePerUnit: row.price_per_unit,
    totalAmount: row.total_amount,
    fee: row.fee,
    date: new Date(row.date),
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    isDeleted: row.is_deleted === 1,
    syncStatus: row.sync_status as SyncStatus,
    syncVersion: row.sync_version,
  };
}

function ts(d: Date | number): number {
  return d instanceof Date ? d.getTime() : d;
}

// ---- Assets ----

export async function loadAssetById(id: string): Promise<Asset | null> {
  const rows = await executeSql<AssetRow>('SELECT * FROM assets WHERE id = ?', [id]);
  return rows.length > 0 ? rowToAsset(rows[0]) : null;
}

export async function loadAssetBySymbol(symbol: string): Promise<Asset | null> {
  const rows = await executeSql<AssetRow>('SELECT * FROM assets WHERE symbol = ? LIMIT 1', [symbol]);
  return rows.length > 0 ? rowToAsset(rows[0]) : null;
}

export async function upsertAsset(asset: Asset): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO assets (
      id, symbol, name, type, exchange, current_price, price_currency, logo_url,
      last_price_update, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      asset.id, asset.symbol, asset.name, asset.type, asset.exchange ?? null,
      asset.currentPrice ?? null, asset.priceCurrency, asset.logoUrl ?? null,
      asset.lastPriceUpdate ? ts(asset.lastPriceUpdate) : null,
      ts(asset.createdAt), ts(asset.updatedAt),
    ],
  );
}

export async function updateAssetPrice(assetId: string, price: number): Promise<void> {
  await executeSql(
    'UPDATE assets SET current_price = ?, last_price_update = ?, updated_at = ? WHERE id = ?',
    [price, Date.now(), Date.now(), assetId],
  );
}

// ---- Holdings ----

export async function loadHoldingsByAccount(accountId: string): Promise<PortfolioHolding[]> {
  const rows = await executeSql<HoldingRow>(
    'SELECT * FROM portfolio_holdings WHERE account_id = ? AND is_deleted = 0 ORDER BY created_at DESC',
    [accountId],
  );
  return rows.map(rowToHolding);
}

export async function loadHoldingById(id: string): Promise<PortfolioHolding | null> {
  const rows = await executeSql<HoldingRow>('SELECT * FROM portfolio_holdings WHERE id = ?', [id]);
  return rows.length > 0 ? rowToHolding(rows[0]) : null;
}

export async function insertHolding(holding: PortfolioHolding): Promise<void> {
  await executeSql(
    `INSERT OR REPLACE INTO portfolio_holdings (
      id, local_id, server_id, account_id, user_id, asset_id, quantity,
      average_cost_basis, total_invested, notes, created_at, updated_at,
      is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      holding.id, holding.localId, holding.serverId ?? null,
      holding.accountId, holding.userId, holding.assetId,
      holding.quantity, holding.averageCostBasis, holding.totalInvested,
      holding.notes ?? null, ts(holding.createdAt), ts(holding.updatedAt),
      holding.isDeleted ? 1 : 0, holding.syncStatus, holding.syncVersion,
    ],
  );
}

export async function updateHolding(id: string, updates: Partial<PortfolioHolding>): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.quantity !== undefined) { sets.push('quantity = ?'); params.push(updates.quantity); }
  if (updates.averageCostBasis !== undefined) { sets.push('average_cost_basis = ?'); params.push(updates.averageCostBasis); }
  if (updates.totalInvested !== undefined) { sets.push('total_invested = ?'); params.push(updates.totalInvested); }
  if (updates.serverId !== undefined) { sets.push('server_id = ?'); params.push(updates.serverId ?? null); }
  if (updates.syncStatus !== undefined) { sets.push('sync_status = ?'); params.push(updates.syncStatus); }
  if (updates.syncVersion !== undefined) { sets.push('sync_version = ?'); params.push(updates.syncVersion); }

  sets.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);

  if (sets.length > 1) {
    await executeSql(`UPDATE portfolio_holdings SET ${sets.join(', ')} WHERE id = ?`, params);
  }
}

export async function softDeleteHolding(id: string): Promise<void> {
  await executeSql(
    'UPDATE portfolio_holdings SET is_deleted = 1, updated_at = ? WHERE id = ?',
    [Date.now(), id],
  );
}

// ---- Transactions ----

export async function loadTransactionsByHolding(holdingId: string): Promise<InvestmentTransaction[]> {
  const rows = await executeSql<TransactionRow>(
    'SELECT * FROM investment_transactions WHERE holding_id = ? AND is_deleted = 0 ORDER BY date DESC',
    [holdingId],
  );
  return rows.map(rowToTransaction);
}

export async function loadTransactionsByAccount(accountId: string): Promise<InvestmentTransaction[]> {
  const rows = await executeSql<TransactionRow>(
    'SELECT * FROM investment_transactions WHERE account_id = ? AND is_deleted = 0 ORDER BY date DESC',
    [accountId],
  );
  return rows.map(rowToTransaction);
}

export async function insertTransaction(tx: InvestmentTransaction): Promise<void> {
  // Check if transaction already exists by localId (to prevent duplicates during sync)
  const existing = await executeSql<TransactionRow>(
    'SELECT * FROM investment_transactions WHERE local_id = ? AND is_deleted = 0',
    [tx.localId],
  );

  if (existing.length > 0) {
    // Update existing transaction with server data
    await executeSql(
      `UPDATE investment_transactions SET
        server_id = ?, sync_status = ?, sync_version = ?, updated_at = ?
      WHERE local_id = ?`,
      [tx.serverId ?? null, tx.syncStatus, tx.syncVersion, ts(tx.updatedAt), tx.localId],
    );
    return;
  }

  await executeSql(
    `INSERT OR REPLACE INTO investment_transactions (
      id, local_id, server_id, holding_id, account_id, user_id, type,
      quantity, price_per_unit, total_amount, fee, date, notes,
      created_at, updated_at, is_deleted, sync_status, sync_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tx.id, tx.localId, tx.serverId ?? null, tx.holdingId,
      tx.accountId, tx.userId, tx.type,
      tx.quantity, tx.pricePerUnit, tx.totalAmount, tx.fee,
      ts(tx.date), tx.notes ?? null,
      ts(tx.createdAt), ts(tx.updatedAt),
      tx.isDeleted ? 1 : 0, tx.syncStatus, tx.syncVersion,
    ],
  );
}

export async function softDeleteTransaction(id: string): Promise<void> {
  await executeSql(
    'UPDATE investment_transactions SET is_deleted = 1, updated_at = ? WHERE id = ?',
    [Date.now(), id],
  );
}

// ---- Holding recalculation (local) ----

export async function recalculateHolding(holdingId: string): Promise<{ quantity: number; averageCostBasis: number; totalInvested: number }> {
  const txs = await loadTransactionsByHolding(holdingId);

  // Sort by date ascending for correct computation
  txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let quantity = 0;
  let totalInvested = 0;

  for (const tx of txs) {
    if (tx.type === 'buy') {
      totalInvested += tx.quantity * tx.pricePerUnit + tx.fee;
      quantity += tx.quantity;
    } else {
      const avgCost = quantity > 0 ? totalInvested / quantity : 0;
      totalInvested -= tx.quantity * avgCost;
      quantity -= tx.quantity;
    }
  }

  quantity = Math.max(0, quantity);
  totalInvested = Math.max(0, totalInvested);
  const averageCostBasis = quantity > 0 ? totalInvested / quantity : 0;

  await updateHolding(holdingId, { quantity, averageCostBasis, totalInvested });

  return { quantity, averageCostBasis, totalInvested };
}

// ---- Dedup helpers ----

export async function deleteHoldingById(id: string): Promise<void> {
  await executeSql('DELETE FROM portfolio_holdings WHERE id = ?', [id]);
}

export async function rebaseTransactionsHoldingId(oldHoldingId: string, newHoldingId: string): Promise<void> {
  await executeSql(
    'UPDATE investment_transactions SET holding_id = ? WHERE holding_id = ?',
    [newHoldingId, oldHoldingId],
  );
}

// ---- Cleanup ----

export async function clearInvestmentsForAccount(accountId: string): Promise<void> {
  await executeSql('DELETE FROM investment_transactions WHERE account_id = ?', [accountId]);
  await executeSql('DELETE FROM portfolio_holdings WHERE account_id = ?', [accountId]);
}

export async function clearAllInvestments(): Promise<void> {
  await executeSql('DELETE FROM investment_transactions', []);
  await executeSql('DELETE FROM portfolio_holdings', []);
  await executeSql('DELETE FROM assets', []);
}

/**
 * Remove duplicate transactions, keeping only the one with server_id (if exists) or the first one.
 */
export async function deduplicateTransactions(): Promise<number> {
  // Find all local_ids that have duplicates
  const duplicates = await executeSql<{ local_id: string; cnt: number }>(
    `SELECT local_id, COUNT(*) as cnt FROM investment_transactions
     WHERE is_deleted = 0
     GROUP BY local_id HAVING cnt > 1`,
    [],
  );

  let removedCount = 0;

  for (const dup of duplicates) {
    // Get all transactions with this local_id
    const txs = await executeSql<TransactionRow>(
      'SELECT * FROM investment_transactions WHERE local_id = ? AND is_deleted = 0 ORDER BY server_id DESC',
      [dup.local_id],
    );

    if (txs.length > 1) {
      // Keep the first one (has server_id if any), delete the rest
      const idsToDelete = txs.slice(1).map((t: TransactionRow) => t.id);
      for (const id of idsToDelete) {
        await executeSql('DELETE FROM investment_transactions WHERE id = ?', [id]);
        removedCount++;
      }
    }
  }

  return removedCount;
}

import { executeSql, withTransaction } from './client';
import type { MerchantCategoryRule } from '@budget/shared-types';

interface RuleRow {
  id: string;
  account_id: string;
  merchant_normalized: string;
  category_id: string;
  created_at: number;
  updated_at: number;
}

function rowToRule(row: RuleRow): MerchantCategoryRule {
  return {
    id: row.id,
    merchantNormalized: row.merchant_normalized,
    categoryId: row.category_id,
    // category_name and category_icon are not stored locally — they come from the API response
    categoryName: '',
    categoryIcon: null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function findAllRules(accountId: string): Promise<MerchantCategoryRule[]> {
  const rows = await executeSql<RuleRow>(
    'SELECT * FROM merchant_category_rules WHERE account_id = ? ORDER BY merchant_normalized ASC',
    [accountId],
  );
  return rows.map(rowToRule);
}

export async function findRuleForMerchant(
  accountId: string,
  merchantNormalized: string,
): Promise<string | null> {
  const rows = await executeSql<{ category_id: string }>(
    'SELECT category_id FROM merchant_category_rules WHERE account_id = ? AND merchant_normalized = ?',
    [accountId, merchantNormalized],
  );
  return rows[0]?.category_id ?? null;
}

export async function upsertRule(
  accountId: string,
  merchantNormalized: string,
  categoryId: string,
  id: string,
): Promise<void> {
  const now = Date.now();
  await executeSql(
    `INSERT INTO merchant_category_rules (id, account_id, merchant_normalized, category_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, merchant_normalized) DO UPDATE SET
       category_id = excluded.category_id,
       updated_at = excluded.updated_at`,
    [id, accountId, merchantNormalized, categoryId, now, now],
  );
}

export async function deleteRule(id: string): Promise<void> {
  await executeSql('DELETE FROM merchant_category_rules WHERE id = ?', [id]);
}

export async function replaceRulesForAccount(
  accountId: string,
  rules: MerchantCategoryRule[],
): Promise<void> {
  await withTransaction(async () => {
    await executeSql('DELETE FROM merchant_category_rules WHERE account_id = ?', [accountId]);
    for (const rule of rules) {
      await executeSql(
        `INSERT INTO merchant_category_rules (id, account_id, merchant_normalized, category_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          rule.id,
          accountId,
          rule.merchantNormalized,
          rule.categoryId,
          new Date(rule.createdAt).getTime(),
          new Date(rule.updatedAt).getTime(),
        ],
      );
    }
  });
}

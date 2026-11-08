import { MMKV } from 'react-native-mmkv';
import type { Account, Category, Currency } from '@budget/shared-types';
import { executeSql } from '@/db/client';
import { insertAccount } from '@/db/accountRepository';
import { insertCategory } from '@/db/categoryRepository';
import { insertExpense } from '@/db/expenseRepository';
import { insertIncome } from '@/db/incomeRepository';
import { insertBudget } from '@/db/budgetRepository';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useFirstRunStore } from '@/stores/firstRunStore';
import { secureStorage } from '@/services/secureStorage';
import { buildDemoData, type DemoCategoryKey } from './demoData';
import { DEMO_ACCOUNT_PREFIX } from './demoAccount';

const mmkv = new MMKV({ id: 'demo-session' });
const PREVIOUS_ACCOUNT_KEY = 'previousAccountId';

const CATEGORIES: { key: DemoCategoryKey; name: string; icon: string; color: string }[] = [
  { key: 'groceries', name: 'Groceries', icon: 'cart-outline', color: '#4CAF50' },
  { key: 'transport', name: 'Transport', icon: 'bus-outline', color: '#2196F3' },
  { key: 'eating_out', name: 'Eating out', icon: 'restaurant-outline', color: '#FF9800' },
  { key: 'entertainment', name: 'Entertainment', icon: 'film-outline', color: '#9C27B0' },
  { key: 'bills', name: 'Bills', icon: 'receipt-outline', color: '#607D8B' },
  { key: 'health', name: 'Health', icon: 'medkit-outline', color: '#F44336' },
  { key: 'shopping', name: 'Shopping', icon: 'bag-outline', color: '#E91E63' },
];

/** Child-row columns whose parent table is account-scoped (line items, splits, tags, ...). */
const PARENT_OF: Record<string, string> = {
  expense_id: 'expenses',
  income_id: 'incomes',
  budget_id: 'budgets',
  goal_id: 'goals',
  debt_id: 'debts',
};

/**
 * Deletes every local row of the given demo account. The demo account is an ordinary editable
 * account, so the user may have added rows to ANY account-scoped table (goals, tags, wallet
 * balances, debts, ...): the tables are discovered from the schema rather than listed, and rows
 * that hang off an account-scoped parent without an account_id of their own go first.
 */
async function purgeDemoAccount(demoId: string): Promise<void> {
  const cols = await executeSql<{ tbl: string; col: string }>(
    `SELECT m.name AS tbl, p.name AS col FROM sqlite_master m JOIN pragma_table_info(m.name) p
     WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'`,
  );
  const columnsOf = new Map<string, Set<string>>();
  for (const { tbl, col } of cols) {
    if (!columnsOf.has(tbl)) columnsOf.set(tbl, new Set());
    columnsOf.get(tbl)!.add(col);
  }
  const scoped = [...columnsOf].filter(([, c]) => c.has('account_id')).map(([t]) => t);
  for (const [tbl, c] of columnsOf) {
    for (const [col, parent] of Object.entries(PARENT_OF)) {
      if (tbl === parent || !c.has(col) || !columnsOf.get(parent)?.has('account_id')) continue;
      await executeSql(
        `DELETE FROM "${tbl}" WHERE ${col} IN (SELECT id FROM "${parent}" WHERE account_id = ?)`,
        [demoId],
      );
    }
  }
  for (const tbl of scoped) {
    await executeSql(`DELETE FROM "${tbl}" WHERE account_id = ?`, [demoId]);
  }
  await executeSql('DELETE FROM accounts WHERE id = ?', [demoId]);
}

export function getActiveDemoAccountId(): string | null {
  const id = useAccountStore.getState().currentAccountId;
  return id && id.startsWith(DEMO_ACCOUNT_PREFIX) ? id : null;
}

function uuid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Seeds a local-only sample account and switches to it. Nothing is queued for sync and the server
 * never learns the account exists (the HTTP client refuses demo-scoped requests).
 */
export async function startDemo(): Promise<string> {
  const user = useAuthStore.getState().user;
  if (!user) throw new Error('Not signed in');
  const now = new Date();
  const accountId = `${DEMO_ACCOUNT_PREFIX}${uuid()}`;
  const currencyCode = (user.currencyCode ?? 'USD') as Currency;

  // Mark onboarding seen first: the rows below must never re-trigger first-run routing.
  useFirstRunStore.getState().markSeen();
  mmkv.set(PREVIOUS_ACCOUNT_KEY, useAccountStore.getState().currentAccountId ?? '');

  const account: Account = {
    id: accountId,
    name: 'Sample data',
    type: 'personal',
    currencyCode,
    ownerId: user.id,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await seedDemoRows(account, user.id, now);
  } catch (err) {
    // Never leave a half-seeded sample account behind.
    await purgeDemoAccount(accountId).catch(() => undefined);
    mmkv.delete(PREVIOUS_ACCOUNT_KEY);
    throw err;
  }

  useAccountStore.setState((s) => ({
    accounts: [...s.accounts.filter((a) => a.id !== accountId), { ...account, myRole: 'owner' as const }],
    currentAccountId: accountId,
  }));
  await secureStorage.setItem('currentAccountId', accountId);
  return accountId;
}

async function seedDemoRows(account: Account, userId: string, now: Date): Promise<void> {
  const accountId = account.id;
  const currencyCode = account.currencyCode as Currency;
  await insertAccount(account, 'owner', userId);

  const categoryIds: Partial<Record<DemoCategoryKey, string>> = {};
  for (const c of CATEGORIES) {
    const id = `${DEMO_ACCOUNT_PREFIX}cat-${c.key}`;
    categoryIds[c.key] = id;
    const category: Category = {
      id,
      userId,
      accountId,
      name: c.name,
      icon: c.icon,
      color: c.color,
      type: 'expense',
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      syncVersion: 1,
    };
    await insertCategory(category);
  }

  const data = buildDemoData({ accountId, userId, currencyCode, now, categoryIds });
  // Sequential: expenses and incomes contend on the single SQLite connection.
  for (const e of data.expenses) await insertExpense(e);
  for (const i of data.incomes) await insertIncome(i);
  for (const b of data.budgets) await insertBudget(b);
}

/** Deletes every demo row and returns to the account the user came from. */
export async function exitDemo(): Promise<void> {
  // Every demo account, not only the current one: the user may have switched away from it.
  const demoIds = await executeSql<{ id: string }>('SELECT id FROM accounts WHERE id LIKE ?', [
    `${DEMO_ACCOUNT_PREFIX}%`,
  ]);
  for (const { id } of demoIds) await purgeDemoAccount(id);
  const previous = mmkv.getString(PREVIOUS_ACCOUNT_KEY) || null;
  mmkv.delete(PREVIOUS_ACCOUNT_KEY);
  useAccountStore.setState((s) => {
    const accounts = s.accounts.filter((a) => !a.id.startsWith(DEMO_ACCOUNT_PREFIX));
    const next = previous && accounts.some((a) => a.id === previous) ? previous : accounts[0]?.id ?? null;
    return { accounts, currentAccountId: next };
  });
  const next = useAccountStore.getState().currentAccountId;
  if (next) await secureStorage.setItem('currentAccountId', next);
}

import type { PrismaService } from '../../database/prisma.service';
import type { BudgetsService } from '../budgets/budgets.service';
import { grantAccountAccess, grantAccountStatus, loadGrantAccountStates } from '../oauth/oauth-grant-accounts.util';
import type { PublicBudget, PublicBudgetList } from './dto/public-budget.dto';
import type { PublicCategoryList, PublicConnectedAccountList, PublicExpense, PublicExpenseList } from './dto/public-expense.dto';
import type { PublicIncome, PublicIncomeList } from './dto/public-income.dto';
import { toPublicBudget } from './mappers/public-budget.mapper';
import { toPublicExpense } from './mappers/public-expense.mapper';
import { toPublicIncome } from './mappers/public-income.mapper';
import { getPublicBudget, listPublicBudgets } from './public-budgets.query';
import { listPublicCategories, type PublicCategoryType } from './public-categories.query';
import { CATEGORY_TIER1_ENCRYPTED_FIELDS } from './public-encryption-fields';
import { PublicApiError } from './public-api-error';
import { getPublicExpense, listPublicExpenses, type PublicExpenseListQuery } from './public-expenses.query';
import { getPublicIncome, listPublicIncomes } from './public-incomes.query';

/**
 * The response bodies of the public READ endpoints, as plain functions of (data source, account,
 * encryption tier, query). The `/public/v1` controllers and the MCP tools both answer through these,
 * so the two surfaces can never drift apart: same rows, same mappers, same tier-1 masking and the
 * same refusals. Account scoping is the caller's job (the account comes from the authorizer).
 */

/** `GET /public/v1/accounts`: the connection's accounts, usable or not; nothing of the user. */
export async function listConnectedAccounts(
  prisma: PrismaService,
  grantId: string,
  userId: string,
  scopes: readonly string[],
): Promise<PublicConnectedAccountList> {
  const states = await loadGrantAccountStates(prisma, grantId, userId);
  return {
    data: states.map((s) => {
      const { active, reason } = grantAccountStatus(s);
      // The grantor is no longer a member: keep the row but reveal nothing current about the account.
      const hidden = s.role === null;
      return {
        id: s.id,
        name: hidden ? null : s.name,
        type: hidden ? null : s.type,
        base_currency: hidden ? null : s.currencyCode,
        access: grantAccountAccess(s, scopes),
        active,
        reason,
      };
    }),
  };
}

/** `GET /public/v1/expenses`. */
export async function readPublicExpenseList(
  prisma: PrismaService,
  accountId: string,
  tier: number,
  q: PublicExpenseListQuery,
): Promise<PublicExpenseList> {
  // At tier 1 merchant/description/notes are withheld from every response; filtering on them would
  // turn the filter into an oracle for the very values withheld (rows a bot or import wrote are
  // plaintext on the server). Refuse rather than silently match nothing.
  if (tier >= 1 && (q.merchant !== undefined || q.search !== undefined)) {
    throw new PublicApiError(
      403,
      'account_encrypted',
      'This account is end-to-end encrypted: merchant and search filters are not available.',
      { fields: ['merchant', 'search'].filter((f) => q[f as 'merchant' | 'search'] !== undefined) },
    );
  }

  const page = await listPublicExpenses(prisma, accountId, q);
  return {
    data: page.rows.map((r) => toPublicExpense(r, { encryptionTier: tier, includeItems: false })),
    next_cursor: page.nextCursor,
    has_more: page.hasMore,
  };
}

/** `GET /public/v1/expenses/{id}`: the detail shape, with items (never the receipt bytes). */
export async function readPublicExpense(prisma: PrismaService, accountId: string, tier: number, id: string): Promise<PublicExpense> {
  const row = await getPublicExpense(prisma, accountId, id);
  return toPublicExpense(row, { encryptionTier: tier, includeItems: true });
}

/** `GET /public/v1/incomes`. */
export async function readPublicIncomeList(
  prisma: PrismaService,
  accountId: string,
  tier: number,
  q: Parameters<typeof listPublicIncomes>[2],
): Promise<PublicIncomeList> {
  // At tier 1 description/notes are withheld; filtering on them would make the filter an oracle
  // for the very values withheld (rows a bot or import wrote are plaintext on the server).
  if (tier >= 1 && q.search !== undefined) {
    throw new PublicApiError(403, 'account_encrypted', 'This account is end-to-end encrypted: the search filter is not available.', {
      fields: ['search'],
    });
  }

  const page = await listPublicIncomes(prisma, accountId, q);
  return {
    data: page.rows.map((r) => toPublicIncome(r, { encryptionTier: tier })),
    next_cursor: page.nextCursor,
    has_more: page.hasMore,
  };
}

/** `GET /public/v1/incomes/{id}`. */
export async function readPublicIncome(prisma: PrismaService, accountId: string, tier: number, id: string): Promise<PublicIncome> {
  const row = await getPublicIncome(prisma, accountId, id);
  return toPublicIncome(row, { encryptionTier: tier });
}

/** `GET /public/v1/categories`. Tier 1: category names are end-to-end encrypted in the app (Ruling 15). */
export async function readPublicCategoryList(
  prisma: PrismaService,
  accountId: string,
  tier: number,
  type: PublicCategoryType | undefined,
): Promise<PublicCategoryList> {
  const rows = await listPublicCategories(prisma, accountId, type);
  const encrypted = tier >= 1;
  return {
    data: rows.map((c) => ({
      id: c.id,
      name: encrypted ? null : c.name,
      parent_id: c.parentId ?? null,
      icon: c.icon ?? null,
      color: c.color ?? null,
      type: c.type,
      encrypted_fields: encrypted ? [...CATEGORY_TIER1_ENCRYPTED_FIELDS] : [],
    })),
  };
}

/** `GET /public/v1/budgets`, each with current-period progress. */
export async function readPublicBudgetList(budgets: BudgetsService, accountId: string, tier: number): Promise<PublicBudgetList> {
  const rows = await listPublicBudgets(budgets, accountId);
  return { data: rows.map((r) => toPublicBudget(r, { encryptionTier: tier })) };
}

/** `GET /public/v1/budgets/{id}`. */
export async function readPublicBudget(
  prisma: PrismaService,
  budgets: BudgetsService,
  accountId: string,
  tier: number,
  id: string,
): Promise<PublicBudget> {
  const row = await getPublicBudget(prisma, budgets, accountId, id);
  return toPublicBudget(row, { encryptionTier: tier });
}

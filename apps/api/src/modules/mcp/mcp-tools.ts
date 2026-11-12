import { Logger } from '@nestjs/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, type ZodRawShape } from 'zod';
import type { PrismaService } from '../../database/prisma.service';
import type { BudgetsService } from '../budgets/budgets.service';
import type { PublicScope } from '../oauth/oauth-scopes';
import { isDateOnly, PUBLIC_EXPENSES_DEFAULT_LIMIT, PUBLIC_EXPENSES_MAX_LIMIT } from '../public-api/dto/public-expense.dto';
import type { PublicAnalyticsService } from '../public-api/public-analytics.service';
import type { AuthorizedContext, PublicApiAuthorizer } from '../public-api/public-api-authorizer.service';
import { PublicApiError } from '../public-api/public-api-error';
import {
  listConnectedAccounts,
  readPublicBudget,
  readPublicBudgetList,
  readPublicCategoryList,
  readPublicExpense,
  readPublicExpenseList,
  readPublicIncome,
  readPublicIncomeList,
} from '../public-api/public-read.views';

/** No tool result ever carries more rows than this (the public list maximum). */
export const MCP_MAX_ROWS = PUBLIC_EXPENSES_MAX_LIMIT;

/** What every tool reads through; built per `/mcp` request by the controller. */
export interface McpToolDeps {
  /** The caller's access token — passed to the authorizer, never logged. */
  bearer: string;
  /** `MCP_RESOURCE_URL`: the surface every token used here must be bound to. */
  resource: string;
  authorizer: Pick<PublicApiAuthorizer, 'authorize'>;
  prisma: PrismaService;
  budgets: BudgetsService;
  analytics: PublicAnalyticsService;
}

interface ToolOutput {
  /** Exactly the JSON the `/public/v1` endpoint answers (rows capped at MCP_MAX_ROWS). */
  json: Record<string, unknown>;
  /** One line for clients that render only text. */
  summary: string;
}

export interface McpToolSpec {
  name: string;
  title: string;
  description: string;
  /** Required scopes; `[]` together with `connectionLevel` (token-only). */
  scopes: PublicScope[];
  /** Addresses the connection, not one account (`list_accounts` only). */
  connectionLevel: boolean;
  input: ZodRawShape;
  run(deps: McpToolDeps, auth: AuthorizedContext, args: Record<string, unknown>): Promise<ToolOutput>;
}

function tool<S extends ZodRawShape>(spec: {
  name: string;
  title: string;
  description: string;
  scopes: PublicScope[];
  connectionLevel?: boolean;
  input: S;
  run(deps: McpToolDeps, auth: AuthorizedContext, args: z.infer<z.ZodObject<S>>): Promise<ToolOutput>;
}): McpToolSpec {
  return {
    ...spec,
    connectionLevel: spec.connectionLevel ?? false,
    run: (deps, auth, args) => spec.run(deps, auth, args as z.infer<z.ZodObject<S>>),
  };
}

// ── descriptions ────────────────────────────────────────────────────────────

const READ_ONLY = 'Read-only: this connector cannot create, change or delete anything.';
const CURRENCY =
  "Amounts are decimal strings in the account's currency (each row also carries its own `currency`, which can differ for a foreign purchase).";
const ACCOUNT = 'Pass `account_id` (an id from list_accounts) when the connection covers more than one account.';
const PAGING =
  'Returns at most 200 rows per call (`limit`, default 50). When `has_more` is true, call again with `cursor` set to the returned `next_cursor` to get the next page.';

const sentences = (...parts: string[]) => parts.join(' ');

// ── input pieces ────────────────────────────────────────────────────────────

const accountIdInput = z
  .string()
  .trim()
  .uuid({ message: 'account_id must be one account id (a UUID) from list_accounts' })
  .optional()
  .describe('The account to read: an `id` from list_accounts. May be omitted only when the connection covers a single account.');
const dateInput = (what: string) =>
  z
    .string()
    .refine(isDateOnly, { message: 'must be a calendar date YYYY-MM-DD' })
    .describe(`${what}, YYYY-MM-DD, inclusive.`);
const idInput = (what: string) => z.string().trim().uuid({ message: `id must be the ${what} id (a UUID)` }).describe(`The ${what} id, as returned by the matching list tool.`);
const categoryIdInput = z.string().uuid().optional().describe("Only rows of this category (an id from list_categories); the row's own category, not splits.");
const searchInput = z.string().min(1).max(200).optional().describe('Case-insensitive text contained in the description or the notes.');
const limitInput = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe('Rows per page, 1-200 (default 50). Larger values are capped at 200.');
const cursorInput = z.string().min(1).max(1024).optional().describe('`next_cursor` from the previous page, unchanged. Omit for the first page.');
const amountInput = (what: string) =>
  z.number().finite().min(0).max(9_999_999_999.99).optional().describe(`${what}, inclusive, in the row's own currency.`);

const clampLimit = (limit: number | undefined) => Math.min(limit ?? PUBLIC_EXPENSES_DEFAULT_LIMIT, MCP_MAX_ROWS);

function validation(field: string, message: string): PublicApiError {
  return new PublicApiError(400, 'validation_failed', 'The request is invalid.', { fields: { [field]: [message] } });
}

/** A non-paginated list cut to MCP_MAX_ROWS; the summary says when it was cut. */
function capped(json: { data: unknown[] }, noun: string): ToolOutput {
  const total = json.data.length;
  if (total <= MCP_MAX_ROWS) return { json: json as unknown as Record<string, unknown>, summary: `${total} ${noun}.` };
  return {
    json: { ...json, data: json.data.slice(0, MCP_MAX_ROWS) },
    summary: `Showing ${MCP_MAX_ROWS} of ${total} ${noun} (the per-call maximum).`,
  };
}

function page(json: { data: unknown[]; next_cursor: string | null; has_more: boolean }, noun: string, toolName: string): ToolOutput {
  const more = json.has_more && json.next_cursor ? ` More available: call ${toolName} again with cursor "${json.next_cursor}".` : '';
  return { json: json as unknown as Record<string, unknown>, summary: `${json.data.length} ${noun}.${more}` };
}

// ── the tools ───────────────────────────────────────────────────────────────

export const MCP_TOOLS: readonly McpToolSpec[] = [
  tool({
    name: 'list_accounts',
    title: 'List connected accounts',
    description: sentences(
      'Lists the budget accounts this connection may read: id, name, type, base currency, access and whether each is usable now (`active`, `reason`).',
      'Call this first when the connection covers several accounts, then pass the chosen `id` as `account_id` to the other tools.',
      READ_ONLY,
    ),
    scopes: [],
    connectionLevel: true,
    input: {},
    run: async (d, auth) => {
      const json = await listConnectedAccounts(d.prisma, auth.oauth.grantId, auth.user.id, auth.oauth.scopes);
      const usable = json.data.filter((a) => a.active).length;
      return { json: json as unknown as Record<string, unknown>, summary: `${json.data.length} connected accounts, ${usable} usable.` };
    },
  }),

  tool({
    name: 'list_expenses',
    title: 'List expenses',
    description: sentences(
      'Lists expenses of one account, newest first, with optional date range, category, text search and amount filters.',
      PAGING,
      CURRENCY,
      ACCOUNT,
      READ_ONLY,
    ),
    scopes: ['expenses:read'],
    input: {
      account_id: accountIdInput,
      from: dateInput('First day').optional(),
      to: dateInput('Last day').optional(),
      category_id: categoryIdInput,
      search: searchInput,
      min_amount: amountInput('Smallest amount'),
      max_amount: amountInput('Largest amount'),
      limit: limitInput,
      cursor: cursorInput,
    },
    run: async (d, auth, a) => {
      if (a.min_amount !== undefined && a.max_amount !== undefined && a.min_amount > a.max_amount) {
        throw validation('max_amount', 'max_amount must not be smaller than min_amount');
      }
      const json = await readPublicExpenseList(d.prisma, auth.accountId!, auth.oauth.encryptionTier, {
        date_from: a.from,
        date_to: a.to,
        category_id: a.category_id,
        search: a.search,
        min_amount: a.min_amount === undefined ? undefined : String(a.min_amount),
        max_amount: a.max_amount === undefined ? undefined : String(a.max_amount),
        limit: clampLimit(a.limit),
        cursor: a.cursor,
      });
      return page(json, 'expenses', 'list_expenses');
    },
  }),

  tool({
    name: 'get_expense',
    title: 'Get one expense',
    description: sentences(
      'One expense with its line items (at most 200; `items_truncated` marks a longer receipt), category splits, tags and projects. Receipt images are not available through this connector.',
      CURRENCY,
      ACCOUNT,
      READ_ONLY,
    ),
    scopes: ['expenses:read'],
    input: { account_id: accountIdInput, id: idInput('expense') },
    run: async (d, auth, a) => {
      const json = await readPublicExpense(d.prisma, auth.accountId!, auth.oauth.encryptionTier, a.id);
      const summary = `Expense ${json.id}: ${json.amount} ${json.currency} on ${json.date}.`;
      const items = json.items ?? [];
      if (items.length <= MCP_MAX_ROWS) return { json: json as unknown as Record<string, unknown>, summary };
      // A receipt can hold up to 500 lines; no tool result carries more than MCP_MAX_ROWS rows.
      return {
        json: { ...json, items: items.slice(0, MCP_MAX_ROWS), items_truncated: true, items_total: items.length },
        summary: `${summary} Showing ${MCP_MAX_ROWS} of ${items.length} line items.`,
      };
    },
  }),

  tool({
    name: 'list_incomes',
    title: 'List incomes',
    description: sentences(
      'Lists incomes of one account, newest first, with optional date range, category and text search filters.',
      PAGING,
      CURRENCY,
      ACCOUNT,
      READ_ONLY,
    ),
    scopes: ['incomes:read'],
    input: {
      account_id: accountIdInput,
      from: dateInput('First day').optional(),
      to: dateInput('Last day').optional(),
      category_id: categoryIdInput,
      search: searchInput,
      limit: limitInput,
      cursor: cursorInput,
    },
    run: async (d, auth, a) => {
      // As GET /public/v1/incomes (IsNotBeforeFromConstraint).
      if (a.from !== undefined && a.to !== undefined && a.to < a.from) throw validation('to', 'to must not be before from');
      const json = await readPublicIncomeList(d.prisma, auth.accountId!, auth.oauth.encryptionTier, {
        date_from: a.from,
        date_to: a.to,
        category_id: a.category_id,
        search: a.search,
        limit: clampLimit(a.limit),
        cursor: a.cursor,
      });
      return page(json, 'incomes', 'list_incomes');
    },
  }),

  tool({
    name: 'get_income',
    title: 'Get one income',
    description: sentences('One income with its category, tags and projects.', CURRENCY, ACCOUNT, READ_ONLY),
    scopes: ['incomes:read'],
    input: { account_id: accountIdInput, id: idInput('income') },
    run: async (d, auth, a) => {
      const json = await readPublicIncome(d.prisma, auth.accountId!, auth.oauth.encryptionTier, a.id);
      return { json: json as unknown as Record<string, unknown>, summary: `Income ${json.id}: ${json.amount} ${json.currency} on ${json.date}.` };
    },
  }),

  tool({
    name: 'list_categories',
    title: 'List categories',
    description: sentences(
      "Lists the account's own expense categories (default) or income categories, with their ids for the category_id filter.",
      `Returns at most ${MCP_MAX_ROWS} categories.`,
      "Categories carry no amounts; amounts elsewhere are in the account's currency.",
      ACCOUNT,
      READ_ONLY,
    ),
    scopes: ['categories:read'],
    input: {
      account_id: accountIdInput,
      type: z.enum(['expense', 'income']).optional().describe('Which categories: `expense` (default) or `income`.'),
    },
    run: async (d, auth, a) => {
      const json = await readPublicCategoryList(d.prisma, auth.accountId!, auth.oauth.encryptionTier, a.type);
      return capped(json, `${a.type ?? 'expense'} categories`);
    },
  }),

  tool({
    name: 'list_budgets',
    title: 'List budgets',
    description: sentences(
      'Lists the budgets of one account, each with its current-period progress (spent, remaining, percentage used, projected total).',
      `Returns at most ${MCP_MAX_ROWS} budgets.`,
      CURRENCY,
      ACCOUNT,
      READ_ONLY,
    ),
    scopes: ['budgets:read'],
    input: { account_id: accountIdInput },
    run: async (d, auth) => {
      const json = await readPublicBudgetList(d.budgets, auth.accountId!, auth.oauth.encryptionTier);
      return capped(json, 'budgets');
    },
  }),

  tool({
    name: 'get_budget',
    title: 'Get one budget',
    description: sentences('One budget with its category allocations and current-period progress.', CURRENCY, ACCOUNT, READ_ONLY),
    scopes: ['budgets:read'],
    input: { account_id: accountIdInput, id: idInput('budget') },
    run: async (d, auth, a) => {
      const json = await readPublicBudget(d.prisma, d.budgets, auth.accountId!, auth.oauth.encryptionTier, a.id);
      return { json: json as unknown as Record<string, unknown>, summary: `Budget ${json.id}: ${json.amount} ${json.currency} per ${json.period}.` };
    },
  }),

  tool({
    name: 'get_spending_summary',
    title: 'Spending summary',
    description: sentences(
      'Server-computed totals for a date range (at most 366 days; 24 months for group_by=month):',
      '`total` = income, expenses and net; `category` = expenses per category with shares; `month` = income, expenses and net per calendar month.',
      "Amounts are converted to one currency — the account's currency unless the response's `currency` says otherwise; `fx_approximate` marks amounts left out for a missing exchange rate.",
      ACCOUNT,
      READ_ONLY,
    ),
    scopes: ['analytics:read'],
    input: {
      account_id: accountIdInput,
      from: dateInput('First day'),
      to: dateInput('Last day'),
      group_by: z.enum(['total', 'category', 'month']).describe('`total`, `category` or `month`.'),
    },
    run: async (d, auth, a) => {
      const accountId = auth.accountId!;
      const tier = auth.oauth.encryptionTier;
      const range = { from: a.from, to: a.to };
      if (a.group_by === 'total') {
        const json = await d.analytics.summary(accountId, auth.user.id, range, tier);
        return {
          json: json as unknown as Record<string, unknown>,
          summary: `${json.from}..${json.to}: income ${json.total_income}, expenses ${json.total_expenses}, net ${json.net} ${json.currency}.`,
        };
      }
      if (a.group_by === 'category') {
        const json = await d.analytics.byCategory(accountId, auth.user.id, { ...range, type: 'expense' }, tier);
        return capped(json, `categories with spending (${json.currency})`);
      }
      const json = await d.analytics.monthly(accountId, auth.user.id, range, tier);
      return capped(json, `months (${json.currency})`);
    },
  }),
];

export const MCP_TOOL_NAMES: readonly string[] = MCP_TOOLS.map((t) => t.name);

// ── running a tool ──────────────────────────────────────────────────────────

const logger = new Logger('McpTools');

/**
 * The class name of an unexpected error for the log line (`PrismaClientKnownRequestError`,
 * `TypeError`, …) — never its message, which can carry row values. Anything that is not a plain
 * identifier is reported as `Error`; a thrown non-Error as `non-error`.
 */
export function errorNameForLog(err: unknown): string {
  if (!(err instanceof Error)) return 'non-error';
  const name = typeof err.name === 'string' ? err.name : '';
  return /^[A-Za-z_$][A-Za-z0-9_$.]{0,63}$/.test(name) ? name : 'Error';
}

/**
 * One tool call: authorize THIS call (scope, addressed account, rate limit) through the shared
 * authorizer on the MCP resource, run it, and turn every refusal into a tool error the model can act
 * on — never an empty result. Logs the tool name, the outcome code and the duration — plus, for an
 * internal_error, the error's class name (`err=<name>`); never its message or any value.
 */
export async function runMcpTool(t: McpToolSpec, deps: McpToolDeps, args: Record<string, unknown>): Promise<CallToolResult> {
  const started = Date.now();
  let outcome = 'ok';
  let errName: string | null = null;
  try {
    const auth = await deps.authorizer.authorize(deps.bearer, {
      requiredScopes: t.scopes,
      tokenOnly: t.connectionLevel,
      connectionLevel: t.connectionLevel,
      accountId: t.connectionLevel ? null : typeof args.account_id === 'string' ? args.account_id : null,
      resource: deps.resource,
    });
    const { json, summary } = await t.run(deps, auth, args);
    return { content: [{ type: 'text', text: summary }], structuredContent: json };
  } catch (err) {
    if (err instanceof PublicApiError) {
      outcome = err.code;
      return toolError(toolErrorText(err, args));
    }
    outcome = 'internal_error';
    errName = errorNameForLog(err);
    return toolError('internal_error: Something went wrong on our side. Retry in a moment.');
  } finally {
    logger.log(`tool=${t.name} outcome=${outcome} ms=${Date.now() - started}${errName ? ` err=${errName}` : ''}`);
  }
}

function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** `<code>: <message>`, reworded where the REST message would point the model at an HTTP header. */
export function toolErrorText(err: PublicApiError, args: Record<string, unknown>): string {
  const account = typeof args.account_id === 'string' && args.account_id.trim() !== '' ? `"${args.account_id.trim()}"` : "(the connection's only account)";
  switch (err.code) {
    case 'account_required':
      return 'account_required: This connection covers several accounts. Call list_accounts and pass one of the returned ids as account_id.';
    case 'account_not_granted':
      return `account_not_granted: The account ${account} is not part of this connection. Call list_accounts for the ids it covers.`;
    case 'account_encrypted':
      return `account_encrypted: Account ${account}: ${err.message}`;
    case 'grant_inactive':
      return `grant_inactive: Account ${account}: ${err.message}`;
    case 'rate_limited':
      return `rate_limited: Too many requests on this connection. Retry in ${err.retryAfterSec ?? 60} seconds.`;
    case 'insufficient_scope': {
      const required = Array.isArray(err.details?.required) ? (err.details!.required as string[]).join(', ') : 'the needed scope';
      return `insufficient_scope: This connection was not granted ${required}. Ask the user to reconnect and allow it.`;
    }
    case 'unavailable':
      return `unavailable: ${err.message}`;
    default: {
      const fields = err.details?.fields;
      const detail = fields && typeof fields === 'object' ? ` ${JSON.stringify(fields)}` : '';
      // The REST wording names the HTTP header; here the field is the tool argument.
      return `${err.code}: ${err.message}${detail}`.replace(/X-Account-Id/g, 'account_id');
    }
  }
}

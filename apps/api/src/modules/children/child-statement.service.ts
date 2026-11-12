import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ExpenseChildLink } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { EXCLUDE_SPLIT_RECEIVABLE } from '../../common/utils/expense-filters';
import { attributeToCategories } from '../../common/utils/category-attribution';
import { childAmounts, type AttribExpense, type AttribItem } from '../../common/utils/child-attribution';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import { ChildrenService } from './children.service';
import { childStatementTranslator, renderChildStatementPdf } from './child-statement.pdf';

/** One row of the statement's line table: one (expense, category) part of the child's money. */
export interface StatementLine {
  expenseId: string;
  /** YYYY-MM-DD */
  date: string;
  merchant: string | null;
  /** The expense's description (whole), or the attributed products' names (line). */
  description: string | null;
  /** Null = uncategorized; the renderer localises it. */
  categoryName: string | null;
  /** In the expense's own currency. */
  amount: number;
  currencyCode: string;
  /** In the statement currency; null when the rate is unknown (listed, excluded from totals). */
  converted: number | null;
  kind: 'whole' | 'line';
}

/** A receipt planned for the appendix. Its bytes are fetched in batches while the PDF is drawn. */
export interface StatementReceipt {
  expenseId: string;
  date: string;
  merchant: string | null;
}

/** Receipt bytes by expense id; an id missing from the map is skipped. */
export type ReceiptImageLoader = (expenseIds: string[]) => Promise<Map<string, Buffer>>;

export interface StatementData {
  childName: string;
  accountName: string;
  from: string;
  to: string;
  locale: string;
  currencyCode: string;
  /** "Data as of" — the moment the server read the rows. */
  generatedAt: Date;
  total: number;
  byCategory: Array<{ categoryId: string | null; name: string | null; amount: number }>;
  /** Months with a converted amount, ascending (YYYY-MM). */
  byMonth: Array<{ month: string; amount: number }>;
  lines: StatementLine[];
  /** Some line had no exchange rate and is missing from the totals. */
  fxApproximate: boolean;
  receipts: StatementReceipt[];
  /** Receipts left out by the appendix caps (count, total bytes, per-image size). */
  receiptsOmitted: number;
}

export interface ReceiptLimits {
  maxReceipts: number;
  maxTotalBytes: number;
  maxImageBytes: number;
}

const envInt = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

/**
 * The appendix caps. The PDF is built in memory under a 768 MB heap (the
 * backups-export OOM is the precedent), so the receipt bytes it may carry are
 * bounded: 150 receipts, 40 MB in all, 3 MB for any one image. Env-tunable.
 */
export function receiptLimits(): ReceiptLimits {
  return {
    maxReceipts: envInt('CHILD_STATEMENT_MAX_RECEIPTS', 150),
    maxTotalBytes: envInt('CHILD_STATEMENT_MAX_RECEIPT_BYTES', 40 * 1024 * 1024),
    maxImageBytes: envInt('CHILD_STATEMENT_MAX_RECEIPT_IMAGE_BYTES', 3 * 1024 * 1024),
  };
}

/**
 * Which receipts make the appendix, in order: an image over the per-image
 * limit is skipped, one that would break the total is skipped, and nothing is
 * taken past the count cap. Everything skipped is counted as omitted, so the
 * PDF can say so.
 */
export function selectReceipts(
  candidates: Array<{ id: string; size: number }>,
  limits: ReceiptLimits = receiptLimits(),
): { ids: string[]; omitted: number } {
  const ids: string[] = [];
  let total = 0;
  let omitted = 0;
  for (const c of candidates) {
    if (c.size <= 0) continue;
    if (c.size > limits.maxImageBytes || ids.length >= limits.maxReceipts || total + c.size > limits.maxTotalBytes) {
      omitted += 1;
      continue;
    }
    ids.push(c.id);
    total += c.size;
  }
  return { ids, omitted };
}

/** Longest period a statement may cover (builder's call). */
export const STATEMENT_MAX_MONTHS = 24;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: string): Date | null {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  // Rejects 2026-02-30, which `Date` would roll into March.
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

/** Validated [from, to] as UTC midnights; 400 on a bad date, a backwards range, or > 24 months. */
export function statementRange(from: string, to: string): { fromDate: Date; toDate: Date } {
  const fromDate = parseDay(from);
  const toDate = parseDay(to);
  if (!fromDate || !toDate) throw new BadRequestException('from and to must be valid YYYY-MM-DD dates');
  if (fromDate > toDate) throw new BadRequestException('from must not be after to');
  const limit = new Date(fromDate);
  limit.setUTCMonth(limit.getUTCMonth() + STATEMENT_MAX_MONTHS);
  if (toDate >= limit) {
    throw new BadRequestException(`A statement covers at most ${STATEMENT_MAX_MONTHS} months`);
  }
  return { fromDate, toDate };
}

const cents = (n: number) => Math.round(n * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The Pro child statement (child costs, task 8): the server is the source of
 * truth — the app flushes its queues first, and the PDF says "data as of".
 *
 * The money is the screen's money: the same spend predicate (split receivables,
 * planned and deleted rows out — never `isDebt`), the canonical `childAmounts`
 * per expense, and the same split rule as `toAttributionInput` on the device:
 * a WHOLE-attributed expense with live category splits contributes each
 * split's part to that split's category (`attributeToCategories` — splits
 * decide); line attribution uses each line's own category, else the expense's.
 *
 * `childCostSummary` is not used for the totals: its windows are anchored at
 * `now` (this calendar year, the last 12 months), while a statement covers an
 * arbitrary period. The totals are the same `childAmounts` parts summed with
 * the same converter, so they cannot drift from the screen's arithmetic.
 *
 * Only `encryptionTier === 0`: tier 1 encrypts merchant, description and the
 * receipt image, tier 2 the amounts too — the server could print neither.
 * Child names are never logged here.
 */
@Injectable()
export class ChildStatementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly children: ChildrenService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  async generate(
    accountId: string,
    childId: string,
    from: string,
    to: string,
    currencyCode: string,
    locale: string,
  ): Promise<Buffer> {
    const data = await this.build(accountId, childId, from, to, currencyCode, locale);
    return renderChildStatementPdf(data, childStatementTranslator(locale), (ids) =>
      this.loadReceiptImages(accountId, ids),
    );
  }

  async build(
    accountId: string,
    childIdOrClientId: string,
    from: string,
    to: string,
    currencyCode: string,
    locale: string,
  ): Promise<StatementData> {
    const { fromDate, toDate } = statementRange(from, to);

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { name: true, encryptionTier: true },
    });
    if (!account) throw new NotFoundException('Account not found');
    if (account.encryptionTier !== 0) {
      throw new ForbiddenException({
        code: 'ENCRYPTED_ACCOUNT',
        message: 'A statement cannot be generated for an end-to-end encrypted account',
      });
    }

    // Archived children resolve too: they keep their attributions and can produce statements.
    const child = await this.children.findOne(accountId, childIdOrClientId);
    const generatedAt = new Date();

    const rows = await this.prisma.expense.findMany({
      where: {
        accountId,
        ...EXCLUDE_SPLIT_RECEIVABLE,
        isPlanned: false,
        isDeleted: false,
        date: { gte: fromDate, lte: toDate },
        OR: [
          { expenseChildren: { some: { childId: child.id, isDeleted: false } } },
          { items: { some: { childId: child.id, isDeleted: false } } },
        ],
      },
      select: {
        id: true,
        amount: true,
        discountAmount: true,
        currencyCode: true,
        date: true,
        description: true,
        merchant: true,
        categoryId: true,
        isSplitReceivable: true,
        isPlanned: true,
        isDeleted: true,
        category: { select: { name: true } },
        categorySplits: {
          where: { isDeleted: false },
          select: { categoryId: true, amount: true, category: { select: { name: true } } },
        },
        expenseChildren: { where: { isDeleted: false }, select: { childId: true, share: true } },
        // Every live line, attributed or not: the receipt discount is spread over the whole basket.
        items: {
          where: { isDeleted: false },
          select: {
            totalPrice: true,
            lineDiscount: true,
            childId: true,
            categoryId: true,
            description: true,
            category: { select: { name: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    const needsRates = rows.some((r) => r.currencyCode !== currencyCode);
    const rates = needsRates ? await getRatesSafe(this.exchangeRates, currencyCode) : null;
    const convert = (amount: number, currency: string) => convertAmount(amount, currency, currencyCode, rates);

    const lines: Array<StatementLine & { categoryId: string | null }> = [];
    for (const row of rows) {
      // Belt and braces: the query already excludes these.
      if (row.isSplitReceivable || row.isPlanned || row.isDeleted) continue;
      lines.push(...this.linesFor(row, child.id, convert));
    }

    const byCategory = new Map<string, { categoryId: string | null; name: string | null; cents: number }>();
    const byMonth = new Map<string, number>();
    let totalCents = 0;
    let fxApproximate = false;
    for (const l of lines) {
      if (l.converted === null) {
        fxApproximate = true;
        continue;
      }
      const c = cents(l.converted);
      totalCents += c;
      const month = l.date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + c);
      const key = l.categoryId ?? '';
      const cat = byCategory.get(key) ?? { categoryId: l.categoryId, name: l.categoryName, cents: 0 };
      cat.cents += c;
      byCategory.set(key, cat);
    }

    const countedIds = Array.from(new Set(lines.map((l) => l.expenseId)));
    const { receipts, omitted: receiptsOmitted } = await this.planReceipts(accountId, countedIds, lines);

    return {
      childName: child.name,
      accountName: account.name,
      from,
      to,
      locale,
      currencyCode,
      generatedAt,
      total: totalCents / 100,
      byCategory: Array.from(byCategory.values())
        .map((c) => ({ categoryId: c.categoryId, name: c.name, amount: c.cents / 100 }))
        .sort((a, b) => b.amount - a.amount || (a.name ?? '').localeCompare(b.name ?? '')),
      byMonth: Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, c]) => ({ month, amount: c / 100 })),
      lines: lines.map(({ categoryId: _categoryId, ...l }) => l),
      fxApproximate,
      receipts,
      receiptsOmitted,
    };
  }

  /** This child's parts of one expense, each a line-table row. */
  private linesFor(
    row: StatementRow,
    childId: string,
    convert: (amount: number, currency: string) => number | null,
  ): Array<StatementLine & { categoryId: string | null }> {
    const date = day(row.date);
    const categoryNames = new Map<string, string>();
    if (row.categoryId && row.category?.name) categoryNames.set(row.categoryId, row.category.name);
    for (const s of row.categorySplits) if (s.categoryId && s.category?.name) categoryNames.set(s.categoryId, s.category.name);
    for (const i of row.items) if (i.categoryId && i.category?.name) categoryNames.set(i.categoryId, i.category.name);

    const base: AttribExpense = {
      id: row.id,
      amount: Number(row.amount) || 0,
      currencyCode: row.currencyCode,
      date,
      categoryId: row.categoryId,
      discountAmount: row.discountAmount === null ? null : Number(row.discountAmount),
      isSplitReceivable: row.isSplitReceivable,
      isPlanned: row.isPlanned,
    };
    const links: ExpenseChildLink[] = row.expenseChildren.map((l) => ({
      expenseId: row.id,
      childId: l.childId,
      share: Number(l.share),
    }));
    const items: AttribItem[] = row.items.map((i) => ({
      expenseId: row.id,
      totalPrice: Number(i.totalPrice) || 0,
      lineDiscount: i.lineDiscount === null ? null : Number(i.lineDiscount),
      childId: i.childId,
      categoryId: i.categoryId,
    }));

    const isLines = items.some((i) => i.childId);
    const parts: Array<{ categoryId: string | null; amount: number }> = [];
    if (isLines) {
      for (const p of childAmounts(base, links, items)) if (p.childId === childId) parts.push(p);
    } else if (row.categorySplits.length > 0) {
      // The device's rule (`toAttributionInput`): one part per split, each with the expense's child shares.
      attributeToCategories({ amount: row.amount, categoryId: row.categoryId, categorySplits: row.categorySplits }).forEach(
        (split, k) => {
          const id = `${row.id}#split${k}`;
          const sub: AttribExpense = { ...base, id, amount: split.amount, categoryId: split.categoryId ?? null };
          const subLinks = links.map((l) => ({ ...l, expenseId: id }));
          for (const p of childAmounts(sub, subLinks, [])) if (p.childId === childId) parts.push(p);
        },
      );
    } else {
      for (const p of childAmounts(base, links, [])) if (p.childId === childId) parts.push(p);
    }

    return parts.map((p) => {
      const products = isLines
        ? row.items
            .filter((i) => i.childId === childId && (i.categoryId ?? row.categoryId) === p.categoryId)
            .map((i) => i.description)
            .filter(Boolean)
            .join(', ')
        : '';
      const converted = convert(p.amount, row.currencyCode);
      return {
        expenseId: row.id,
        date,
        merchant: row.merchant,
        description: isLines ? products || row.description : row.description,
        categoryName: p.categoryId ? (categoryNames.get(p.categoryId) ?? null) : null,
        categoryId: p.categoryId,
        amount: round2(p.amount),
        currencyCode: row.currencyCode,
        converted: converted === null || !Number.isFinite(converted) ? null : round2(converted),
        kind: isLines ? 'line' : 'whole',
      };
    });
  }

  /**
   * The appendix plan: which counted expenses have a stored receipt, by SIZE
   * only (`octet_length`, no bytes loaded), capped by `selectReceipts`, in line
   * order.
   */
  private async planReceipts(
    accountId: string,
    ids: string[],
    lines: StatementLine[],
  ): Promise<{ receipts: StatementReceipt[]; omitted: number }> {
    if (ids.length === 0) return { receipts: [], omitted: 0 };
    const sized = await this.prisma.$queryRaw<Array<{ id: string; size: number | bigint }>>(Prisma.sql`
      SELECT id, octet_length(receipt_image) AS size
      FROM expenses
      WHERE account_id = ${accountId} AND id = ANY(${ids}) AND receipt_image IS NOT NULL
    `);
    const sizeById = new Map(sized.map((r) => [r.id, Number(r.size)]));
    const candidates = ids.filter((id) => sizeById.has(id)).map((id) => ({ id, size: sizeById.get(id) ?? 0 }));
    const { ids: chosen, omitted } = selectReceipts(candidates);
    const receipts = chosen.map((id) => {
      const first = lines.find((l) => l.expenseId === id)!;
      return { expenseId: id, date: first.date, merchant: first.merchant };
    });
    return { receipts, omitted };
  }

  /** One batch of receipt bytes, scoped to the account. Prisma already returns a Buffer — no copy. */
  async loadReceiptImages(accountId: string, ids: string[]): Promise<Map<string, Buffer>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.expense.findMany({
      where: { accountId, id: { in: ids } },
      select: { id: true, receiptImage: true },
    });
    const out = new Map<string, Buffer>();
    for (const r of rows) {
      if (r.receiptImage && r.receiptImage.length > 0) out.set(r.id, r.receiptImage);
    }
    return out;
  }
}

type StatementRow = {
  id: string;
  amount: unknown;
  discountAmount: unknown;
  currencyCode: string;
  date: Date;
  description: string | null;
  merchant: string | null;
  categoryId: string | null;
  isSplitReceivable: boolean;
  isPlanned: boolean;
  isDeleted: boolean;
  category: { name: string } | null;
  categorySplits: Array<{ categoryId: string; amount: unknown; category: { name: string } | null }>;
  expenseChildren: Array<{ childId: string; share: unknown }>;
  items: Array<{
    totalPrice: unknown;
    lineDiscount: unknown;
    childId: string | null;
    categoryId: string | null;
    description: string;
    category: { name: string } | null;
  }>;
};

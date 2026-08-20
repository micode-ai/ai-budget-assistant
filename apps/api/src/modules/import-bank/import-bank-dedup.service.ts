import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { expensePayee, DUP_DAY_MS } from '../anomaly/anomaly.service';
import { normalizeMerchantPL } from './merchants/merchants-pl';
import { pairFxRows } from './utils/fx-pairing';
import type { BankParser } from './parsers/parser.interface';
import type { BankImportPreviewResponse, ImportRow } from '@budget/shared-types';
import { buildExternalRef } from './utils/build-external-ref';

/**
 * Preview-shaping + dedup concern, split out of ImportBankService (ABA — see
 * "Expenses service split (ABA-368)" convention in CLAUDE.md). Owns stamping
 * externalRefs, pairing FX rows, and the two dedup passes (content-match +
 * possible-merge) that decide what a preview response looks like, plus the
 * pre-commit duplicate-removal pass that keeps the commit transaction from
 * ever hitting the `(account_id, external_ref)` unique constraint (ABA-313).
 */
@Injectable()
export class ImportBankDedupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stamp externalRefs, pair FX rows, flag already-imported, shape response. */
  async buildPreviewResponse(
    accountId: string,
    parser: BankParser,
    parsedRows: ReturnType<BankParser['parse']>['rows'],
    parseErrors: number,
    fingerprint?: string,
  ): Promise<BankImportPreviewResponse> {
    const withRefs: ImportRow[] = parsedRows.map((r) => ({
      ...r,
      merchant: normalizeMerchantPL(r.merchant),
      externalRef: buildExternalRef(parser.id, r),
      alreadyImported: false,
    }));

    const paired = pairFxRows(withRefs, parser.id);

    const refs = paired.map((r) => r.externalRef);
    const [exExp, exInc, exFx] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, externalRef: { in: refs } },
        select: { externalRef: true },
      }),
      this.prisma.income.findMany({
        where: { accountId, externalRef: { in: refs } },
        select: { externalRef: true },
      }),
      this.prisma.currencyExchange.findMany({
        where: { accountId, externalRef: { in: refs } },
        select: { externalRef: true },
      }),
    ]);

    const seen = new Set([
      ...exExp.map((e) => e.externalRef!),
      ...exInc.map((e) => e.externalRef!),
      ...exFx.map((e) => e.externalRef!),
    ]);
    for (const r of paired) {
      if (seen.has(r.externalRef)) r.alreadyImported = true;
    }

    // Content-based dedup: flag rows that match an EXISTING transaction
    // (manual or any source) by date + signed amount + currency, so the same
    // operation isn't duplicated even when it has no externalRef. Greedy 1-to-1
    // so N existing rows only absorb N import rows; extras stay importable.
    await this.flagContentDuplicates(accountId, paired);

    // Tier 2 — suggest-merge: flag rows that match an existing account expense
    // under predicate Q (same payee + date ±1d, DIFFERENT currency). Only
    // non-alreadyImported expense rows are eligible. Does NOT touch importable/
    // skipped counts — possibleMerge rows still import as new by default.
    await this.flagPossibleMerges(accountId, paired);

    return {
      status: 'parsed',
      detectedBankId: parser.id,
      totalRows: paired.length,
      importable: paired.filter((r) => !r.alreadyImported).length,
      skipped: paired.filter((r) => r.alreadyImported).length,
      parseErrors,
      rows: paired,
      headerFingerprint: fingerprint,
    };
  }

  /**
   * Mark import rows that already exist in the account as `alreadyImported`,
   * matching on (date, signed-amount-in-cents, currency) against existing
   * Expense/Income regardless of source. Uses a multiset so the match is
   * one-to-one: if the file has two identical rows but only one already
   * exists, only one is flagged and the other remains importable. FX rows are
   * excluded (they dedup by externalRef only).
   */
  private async flagContentDuplicates(accountId: string, rows: ImportRow[]): Promise<void> {
    const candidates = rows.filter((r) => r.kind !== 'fx');
    if (candidates.length === 0) return;

    const isoDates = [...new Set(candidates.map((r) => r.date))].filter(Boolean).sort();
    if (isoDates.length === 0) return;

    const dateFilter = { in: isoDates.map((d) => new Date(d)) };
    // isDeleted: false is load-bearing, and it is why this differs from the
    // externalRef queries above, which must NOT filter it. Rolling back an
    // import sets { isDeleted: true, externalRef: null }: the null ref is
    // deliberate, so layer 1 stops matching and the file can be imported again.
    // Without this filter layer 2 resurrects those rows and flags nearly every
    // row of the re-imported file as already-imported, defeating the rollback.
    // The externalRef queries are the opposite case — @@unique([accountId,
    // externalRef]) covers soft-deleted rows too, so they have to keep seeing
    // them or the insert violates the constraint and poisons the transaction
    // (ABA-313). Same for flagPossibleMerges, which already filters this.
    const [exps, incs] = await Promise.all([
      this.prisma.expense.findMany({
        where: { accountId, isDeleted: false, date: dateFilter },
        select: { date: true, amount: true, currencyCode: true },
      }),
      this.prisma.income.findMany({
        where: { accountId, isDeleted: false, date: dateFilter },
        select: { date: true, amount: true, currencyCode: true },
      }),
    ]);

    const keyOf = (isoDate: string, signedCents: number, currency: string) =>
      `${isoDate}|${signedCents}|${currency}`;
    const toIso = (d: Date) => new Date(d).toISOString().slice(0, 10);
    const cents = (amount: number, sign: number) => Math.round(sign * Number(amount) * 100);

    // Multiset of existing transactions available to absorb a duplicate.
    const counts = new Map<string, number>();
    const bump = (k: string, by: number) => counts.set(k, (counts.get(k) ?? 0) + by);
    for (const e of exps) bump(keyOf(toIso(e.date), cents(e.amount as unknown as number, -1), e.currencyCode), 1);
    for (const i of incs) bump(keyOf(toIso(i.date), cents(i.amount as unknown as number, 1), i.currencyCode), 1);

    const rowKey = (r: ImportRow) =>
      keyOf(r.date, cents(r.amount, r.kind === 'expense' ? -1 : 1), r.currencyCode);

    // Rows already flagged via externalRef correspond to an existing row, so
    // consume their slot first to avoid double-counting against content dups.
    for (const r of candidates) {
      if (!r.alreadyImported) continue;
      const k = rowKey(r);
      if ((counts.get(k) ?? 0) > 0) bump(k, -1);
    }

    // Greedily flag remaining rows that still have an existing match available.
    for (const r of candidates) {
      if (r.alreadyImported) continue;
      const k = rowKey(r);
      if ((counts.get(k) ?? 0) > 0) {
        r.alreadyImported = true;
        bump(k, -1);
      }
    }
  }

  /**
   * Tier 2 — predicate Q suggest-merge pass.
   * For each NON-alreadyImported expense row, query existing account expenses
   * that match on payee + date ±1d + DIFFERENT currency. Sets possibleMerge:true
   * and mergeCandidateIds on matching rows. Does NOT change alreadyImported,
   * importable, or skipped counts — the row still imports as new by default.
   * P and Q are mutually exclusive (same vs different currency), so a row
   * that content-deduped under P cannot also Q-match the same expense.
   */
  private async flagPossibleMerges(accountId: string, rows: ImportRow[]): Promise<void> {
    const eligible = rows.filter((r) => !r.alreadyImported && r.kind === 'expense');
    if (eligible.length === 0) return;

    const isoDates = [...new Set(eligible.map((r) => r.date))].filter(Boolean).sort();
    if (isoDates.length === 0) return;

    // Build a date window spanning all eligible rows' ±1 day.
    const allMs = isoDates.map((d) => new Date(d).getTime());
    const minDate = new Date(Math.min(...allMs) - DUP_DAY_MS);
    const maxDate = new Date(Math.max(...allMs) + DUP_DAY_MS);

    const existing = await this.prisma.expense.findMany({
      where: { accountId, isDeleted: false, date: { gte: minDate, lte: maxDate } },
      select: { id: true, date: true, merchant: true, description: true, currencyCode: true },
    });

    for (const r of eligible) {
      const label = expensePayee({ merchant: r.merchant, description: r.description });
      if (!label) continue;

      const rowDateMs = new Date(r.date).getTime();
      const matches = existing.filter(
        (e) =>
          expensePayee({ merchant: e.merchant, description: e.description }) === label &&
          e.currencyCode !== r.currencyCode && // Q: currencies DIFFER
          Math.abs(new Date(e.date).getTime() - rowDateMs) <= DUP_DAY_MS,
      );

      if (matches.length > 0) {
        r.possibleMerge = true;
        r.mergeCandidateIds = matches.map((m) => m.id);
      }
    }
  }

  /**
   * Remove rows whose externalRef already exists in this account (expense /
   * income / currency exchange) or repeats earlier in the same batch, so the
   * unique `(account_id, external_ref)` constraint can't fire inside the commit
   * transaction (which Postgres would otherwise abort wholesale — ABA-313). Rows
   * without an externalRef are always kept (nothing to collide on).
   */
  async dropDuplicateRows<T extends { externalRef?: string | null }>(
    accountId: string,
    rows: T[],
  ): Promise<T[]> {
    const refs = Array.from(
      new Set(rows.map((r) => r.externalRef).filter((r): r is string => !!r)),
    );
    const existing = new Set<string>();
    if (refs.length) {
      const [exExp, exInc, exFx] = await Promise.all([
        this.prisma.expense.findMany({ where: { accountId, externalRef: { in: refs } }, select: { externalRef: true } }),
        this.prisma.income.findMany({ where: { accountId, externalRef: { in: refs } }, select: { externalRef: true } }),
        this.prisma.currencyExchange.findMany({ where: { accountId, externalRef: { in: refs } }, select: { externalRef: true } }),
      ]);
      for (const e of [...exExp, ...exInc, ...exFx]) {
        if (e.externalRef) existing.add(e.externalRef);
      }
    }
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
      const ref = row.externalRef;
      if (ref) {
        if (existing.has(ref) || seen.has(ref)) continue;
        seen.add(ref);
      }
      out.push(row);
    }
    return out;
  }
}

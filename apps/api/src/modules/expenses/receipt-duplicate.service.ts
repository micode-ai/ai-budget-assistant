import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { ReceiptDuplicateMatch } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { DAY_MS, expensePayee, payeesLooselyMatch } from '../anomaly/anomaly-helpers.util';

/**
 * The receipt file's fingerprint: SHA-256 of its base64 text, whitespace
 * removed. The app computes the same value on the device before uploading
 * anything (expo-crypto over the identical string), so the two sides must
 * never diverge — hash the base64 TEXT, not the decoded bytes.
 */
export function receiptFingerprint(base64: string): string {
  return createHash('sha256').update((base64 ?? '').replace(/\s/g, '')).digest('hex');
}

export const RECEIPT_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;

interface CandidateRow {
  id: string;
  clientId: string;
  merchant: string | null;
  description: string | null;
  amount: unknown;
  currencyCode: string;
  date: Date;
  source?: string | null;
}

const BANK_SOURCES = new Set(['notification', 'import']);

function toMatch(kind: ReceiptDuplicateMatch['kind'], row: CandidateRow, amountOnly = false): ReceiptDuplicateMatch {
  return {
    kind,
    expenseId: row.id,
    clientId: row.clientId,
    merchant: row.merchant,
    description: row.description,
    amount: Number(row.amount),
    currencyCode: row.currencyCode,
    date: row.date.toISOString(),
    source: (row.source ?? null) as ReceiptDuplicateMatch['source'],
    ...(amountOnly && { amountOnly: true }),
  };
}

/**
 * Pure: the saved expense a freshly-read receipt most likely duplicates, by the
 * same rule the post-save duplicate alert uses (`detectDuplicateCharge`) —
 * same payee label, amount and currency within ±1 day. Candidates are already
 * filtered on amount/currency/date by the query; this decides the payee.
 *
 * A bank-captured copy (`notification`/`import`) names the shop the bank's way
 * (`ZABKA Z5712 WARSZAWA` vs the receipt's `Żabka`), so against those rows the
 * payee is matched loosely, and failing that a SINGLE bank row is accepted on
 * amount alone (`amountOnly`) — the same pairing `pickPushReceiptCounterpart`
 * uses after the save. It is a suggestion the user confirms, never a merge.
 */
export function pickLikelyDuplicate(
  receipt: { merchant?: string | null; description?: string | null },
  candidates: CandidateRow[],
): ReceiptDuplicateMatch | null {
  const label = expensePayee(receipt);
  const hit = label ? candidates.find((c) => expensePayee(c) === label) : undefined;
  if (hit) return toMatch('likely', hit);
  const bank = candidates.filter((c) => BANK_SOURCES.has(c.source ?? ''));
  const loose = label ? bank.find((c) => payeesLooselyMatch(label, expensePayee(c))) : undefined;
  if (loose) return toMatch('likely', loose);
  return bank.length === 1 ? toMatch('likely', bank[0], true) : null;
}

const SELECT = {
  id: true,
  clientId: true,
  merchant: true,
  description: true,
  amount: true,
  currencyCode: true,
  date: true,
  source: true,
} as const;

/**
 * "Has this receipt been scanned before?" (ABA-603), asked twice: before OCR by
 * the file's fingerprint (free — no AI request is spent on a re-upload), and
 * after OCR by what the receipt says. Both are warnings only; nothing here
 * blocks a save. Every method is read-only and never throws — a failed check
 * must degrade to "no duplicate", never to a failed scan.
 */
@Injectable()
export class ReceiptDuplicateService {
  private readonly logger = new Logger(ReceiptDuplicateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByFingerprint(accountId: string, fingerprint: string): Promise<ReceiptDuplicateMatch | null> {
    if (!RECEIPT_FINGERPRINT_PATTERN.test(fingerprint ?? '')) return null;
    try {
      const row = await this.prisma.expense.findFirst({
        where: { accountId, isDeleted: false, receiptFingerprint: fingerprint },
        orderBy: { createdAt: 'desc' },
        select: SELECT,
      });
      return row ? toMatch('exact', row as CandidateRow) : null;
    } catch (error) {
      this.logger.warn(`[ReceiptDuplicate] fingerprint lookup failed: ${error}`);
      return null;
    }
  }

  async findLikely(
    accountId: string,
    receipt: {
      merchant?: string | null;
      description?: string | null;
      amount: number;
      currencyCode: string;
      date: string | null | undefined;
    },
  ): Promise<ReceiptDuplicateMatch | null> {
    if (!receipt.date || !(receipt.amount > 0) || !receipt.currencyCode) return null;
    const date = new Date(receipt.date);
    if (Number.isNaN(date.getTime())) return null;
    try {
      const candidates = await this.prisma.expense.findMany({
        where: {
          accountId,
          isDeleted: false,
          amount: receipt.amount,
          currencyCode: receipt.currencyCode,
          date: { gte: new Date(date.getTime() - DAY_MS), lte: new Date(date.getTime() + DAY_MS) },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: SELECT,
      });
      return pickLikelyDuplicate(receipt, candidates as CandidateRow[]);
    } catch (error) {
      this.logger.warn(`[ReceiptDuplicate] likely lookup failed: ${error}`);
      return null;
    }
  }
}

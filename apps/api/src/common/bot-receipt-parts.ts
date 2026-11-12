import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ReceiptImagePart } from '@budget/shared-types';
import type { CacheService } from './cache/cache.service';
import type { OcrService, ReceiptExpense } from '../modules/ai/services/ocr.service';
import type { SubscriptionsService } from '../modules/subscriptions/subscriptions.service';
import { RECEIPT_PART_MIME_TYPES } from '../modules/ai/utils/sanitize';

/**
 * A long receipt photographed in several pieces, sent to a chat bot.
 *
 * Shared by the Telegram / WhatsApp / Slack bots. There are no timers: a single
 * photo scans at once; while a receipt confirmation is pending in that chat, the
 * next photo asks "continuation or new receipt?". The pending receipt keeps its
 * image parts (`parts`, top to bottom, part 1 first) next to the scan result, in
 * `CacheService` under the bot's own key prefix — never a module-level Map.
 */

/** A receipt in the bots has at most this many parts (the API's own cap). */
export const MAX_BOT_PARTS = 4;
/** Each cached part is a downscaled JPEG of at most 1.5 MB (decoded bytes). */
export const MAX_BOT_PART_BYTES = 1_572_864;

/**
 * Points at the receipt confirmation currently pending for ONE user in ONE chat,
 * so in a group another member's photo is never taken as a continuation.
 */
export function pendingPointerKey(prefix: string, chatId: string, userId: string): string {
  return `${prefix}:receipt-latest:${chatId}:${userId}`;
}

/** Decoded size of a base64 payload, without allocating the buffer. */
export function base64ByteLength(base64: string): number {
  return Buffer.byteLength(base64, 'base64');
}

export type AppendPartResult = 'ok' | 'full' | 'too_large' | 'expired';

/**
 * Appends one image part to the pending receipt stored under `receiptKey` and
 * writes the receipt back with `cache.set` (a Redis read is a fresh copy, so a
 * mutation that is not written back is lost). The TTL is re-applied as given —
 * pass the bot's pending-receipt TTL.
 */
export async function appendPart(
  cache: CacheService,
  receiptKey: string,
  part: ReceiptImagePart,
  ttlSec: number,
): Promise<AppendPartResult> {
  const data = await cache.get<{ parts?: ReceiptImagePart[] }>(receiptKey);
  if (!data) return 'expired';
  const parts = data.parts ?? [];
  if (parts.length >= MAX_BOT_PARTS) return 'full';
  if (base64ByteLength(part.imageBase64) > MAX_BOT_PART_BYTES) return 'too_large';
  data.parts = [...parts, part];
  await cache.set(receiptKey, data, ttlSec);
  return 'ok';
}

/** Whether a scanned file can be a receipt part: an image type the parts reader accepts, within the cap. */
export function canBePart(base64: string, mimeType: string): boolean {
  return RECEIPT_PART_MIME_TYPES.includes(mimeType.toLowerCase()) && base64ByteLength(base64) <= MAX_BOT_PART_BYTES;
}

/** How long one action may own a pending receipt (a continuation's model call, a save, a cancel). */
export const RECEIPT_BUSY_TTL_SEC = 300;
/** A bot scan costs 2.0 per image part; an added part costs one more 2.0. */
export const OCR_COST_PER_PART = 2.0;

/**
 * Runs `work` holding the receipt's busy lock (`setIfAbsent` on `lockKey`),
 * released in `finally`. Returns false, running nothing, when another action
 * holds it — the caller tells the user to wait. `setIfAbsent` is false on a
 * Redis outage too: refusing is the safe side.
 */
export async function withReceiptLock(
  cache: CacheService,
  lockKey: string,
  work: () => Promise<void>,
): Promise<boolean> {
  if (!(await cache.setIfAbsent(lockKey, RECEIPT_BUSY_TTL_SEC))) return false;
  try {
    await work();
  } finally {
    await cache.del(lockKey);
  }
  return true;
}

/** The fields of a pending receipt the continuation reads; each bot's own type extends it. */
export interface PartsPendingReceipt {
  userId: string;
  accountId: string;
  parts?: ReceiptImagePart[];
  caption?: string;
}

/** Why a part was refused (always refunded). `unreadable` = the reader rejected the parts. */
export type PartRefusal = 'full' | 'too_large' | 'expired' | 'unreadable';

export type ContinuationResult<T> =
  /** The AI limit refused the charge: nothing changed, the parked photo should be kept. */
  | { status: 'limit' }
  /** Refused and refunded; the receipt is as it was. */
  | { status: 'refused'; reason: PartRefusal }
  /** Read, but the receipt was saved, cancelled or changed meanwhile: nothing written, card not ours. */
  | { status: 'superseded' }
  /** The receipt was replaced by the read of all parts; `data` is what was written. */
  | { status: 'ok'; receipt: ReceiptExpense; data: T };

export interface ContinuationDeps {
  cache: CacheService;
  subscriptions: Pick<SubscriptionsService, 'trackAiUsage' | 'refundAiUsage'>;
  ocr: Pick<OcrService, 'parseReceiptParts'>;
}

export interface ContinuationArgs<T> {
  receiptKey: string;
  part: ReceiptImagePart;
  /** The user who sent the photo: billed, and must own the receipt. */
  userId: string;
  accountId: string;
  /** The bot's pending-receipt TTL. */
  ttlSec: number;
  /** After the charge succeeded: the parked photo is consumed (delete it, acknowledge the tap). */
  onCharged?: () => Promise<void>;
  /** The part was added and the read is about to start (refresh the pointer, show "typing"). */
  onAppended?: () => Promise<void>;
  /** The pending receipt with the read's result in place of the earlier one. */
  apply: (current: T, receipt: ReceiptExpense) => T;
}

/**
 * "Continuation": the photo becomes the receipt's next part and ONE model call
 * re-reads all parts; the result replaces the pending receipt. Shared by the
 * three bots — call it while holding `withReceiptLock` for the receipt.
 *
 * Billing mirrors the API at 2.0 per part: the added part is charged first
 * (the AI limit can refuse it), and refunded on every refusal — full, too
 * large, receipt gone, or the reader rejecting the parts (`BadRequestException`).
 * The receipt is re-read before any write: a failed read rolls the part back
 * only onto the receipt this call extended, and a successful one is written
 * only when that receipt is still there with the same parts. Any other model
 * error is rethrown after the rollback (not refunded, as a failed single scan).
 */
export async function continueReceiptWithPart<T extends PartsPendingReceipt>(
  deps: ContinuationDeps,
  args: ContinuationArgs<T>,
): Promise<ContinuationResult<T>> {
  const { cache, subscriptions, ocr } = deps;
  const { receiptKey: key, userId, accountId, ttlSec } = args;
  const refund = () => subscriptions.refundAiUsage(userId, 'ocr', OCR_COST_PER_PART, accountId);

  try {
    await subscriptions.trackAiUsage(userId, 'ocr', OCR_COST_PER_PART, accountId);
  } catch (e) {
    if (e instanceof ForbiddenException) return { status: 'limit' };
    throw e;
  }
  await args.onCharged?.();

  const before = await cache.get<T>(key);
  const appended =
    before && before.userId === userId ? await appendPart(cache, key, args.part, ttlSec) : 'expired';
  if (appended !== 'ok') {
    await refund();
    return { status: 'refused', reason: appended };
  }

  const data = await cache.get<T>(key);
  if (!data) {
    await refund();
    return { status: 'refused', reason: 'expired' };
  }
  const parts = data.parts ?? [];
  await args.onAppended?.();

  let receipt: ReceiptExpense;
  try {
    receipt = await ocr.parseReceiptParts(parts, data.userId, data.accountId, data.caption);
  } catch (error) {
    // The card still shows the earlier parts: put those back — but only onto the
    // receipt this call extended, never onto a newer state or a receipt that is gone.
    const current = await cache.get<T>(key);
    if (current && current.parts?.length === parts.length) {
      await cache.set<T>(key, before!, ttlSec);
    }
    if (error instanceof BadRequestException) {
      // The reader refused the parts: not a read that happened, so not billed.
      await refund();
      return { status: 'refused', reason: 'unreadable' };
    }
    throw error;
  }

  // Saved, cancelled or expired meanwhile: the receipt is no longer ours to touch.
  const current = await cache.get<T>(key);
  if (!current || current.parts?.length !== parts.length) return { status: 'superseded' };

  const updated = args.apply(current, receipt);
  await cache.set<T>(key, updated, ttlSec);
  return { status: 'ok', receipt, data: updated };
}

/** The shared-message key (and params) telling the user why a part was refused. */
export function partRefusalMessage(reason: PartRefusal): { key: string; params?: Record<string, string> } {
  switch (reason) {
    case 'full':
      return { key: 'receiptPartsFull', params: { max: String(MAX_BOT_PARTS) } };
    case 'too_large':
      return { key: 'receiptPartTooLarge' };
    case 'unreadable':
      return { key: 'receiptScanFailed' };
    default:
      return { key: 'scanRequestExpired' };
  }
}

/**
 * Pure side of share-text-to-capture (docs/contracts/share-text-to-capture.md).
 * A text shared from SMS / e-mail / a messenger goes through the SAME on-device
 * parser and spend gate as an auto-captured bank push, so a promo text is never
 * offered as an expense. Nothing here saves anything: the result only prefills
 * the ordinary create form.
 */
import { parseNotification } from '@/services/notificationParser';
import { looksLikeSpendNotification } from '@/services/notificationParser/generic';

/** Pseudo package: not in any template table, so the generic parser runs. */
export const SHARE_TEXT_PACKAGE = 'share.text';

/** Above this a text is an e-mail body, not a push — the generic parser assumes short text. */
export const LOCAL_PARSE_MAX_CHARS = 1000;

export type SharedTextResult =
  | { kind: 'not_spend' }
  | { kind: 'needs_ai' }
  | {
      kind: 'parsed';
      amount: number;
      currencyCode: string;
      merchant: string | null;
      date: Date;
      suggestedCategory: string | undefined;
    };

export function classifySharedText(text: string, now: Date = new Date()): SharedTextResult {
  const body = text.trim();
  if (!looksLikeSpendNotification(body)) return { kind: 'not_spend' };
  if (body.length > LOCAL_PARSE_MAX_CHARS) return { kind: 'needs_ai' };
  const p = parseNotification(SHARE_TEXT_PACKAGE, '', body, now.getTime());
  if (!p) return { kind: 'needs_ai' };
  return {
    kind: 'parsed',
    amount: p.amount,
    currencyCode: p.currencyCode,
    merchant: p.merchant,
    date: p.occurredAt,
    suggestedCategory: p.suggestedCategory,
  };
}

/** Subset of the create form's prefill that this feature fills (all strings: route params). */
export type SharedTextPrefill = {
  amount?: string;
  currencyCode?: string;
  merchant?: string;
  description?: string;
  categoryId?: string;
  date?: string;
  source: 'notification';
  externalRef?: string;
};

export function buildSharedTextPrefill(i: {
  amount?: number;
  currencyCode?: string;
  merchant?: string | null;
  description?: string;
  categoryId?: string;
  date?: Date;
  externalRef?: string;
}): SharedTextPrefill {
  const out: SharedTextPrefill = { source: 'notification' };
  if (i.amount != null && i.amount > 0) out.amount = String(i.amount);
  if (i.currencyCode) out.currencyCode = i.currencyCode;
  if (i.merchant) out.merchant = i.merchant;
  if (i.description) out.description = i.description.slice(0, 200);
  if (i.categoryId) out.categoryId = i.categoryId;
  if (i.date) out.date = i.date.toISOString();
  if (i.externalRef) out.externalRef = i.externalRef;
  return out;
}

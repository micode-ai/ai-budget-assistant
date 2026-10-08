import type { InboundReceiptListItem, InboundReceiptStatus } from '@budget/shared-types';

/**
 * Pure rules for the e-receipt inbox (ABA-644). Kept free of React Native and
 * expo-router so every decision here can be pinned by jest.
 */

/** With the server flag off, every inbound-mail route answers 404. */
export function isFeatureUnavailable(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404;
}

export type ConfirmOutcome = 'retry' | 'drop';

/**
 * What to do with the `POST /confirm` that follows a local save.
 *
 * The expense is created offline-first, so when the confirm call races ahead of
 * the expense's own sync the server answers 404 ("Expense not found") - that and
 * every network/5xx/429 failure must be retried, never dropped, or the item stays
 * pending forever. A 409/403/400/410 will not improve by retrying.
 */
export function confirmOutcome(error: unknown): ConfirmOutcome {
  const status = (error as { status?: number } | null)?.status;
  if (status === undefined) return 'retry'; // offline / fetch failure
  if (status === 404 || status === 429 || status >= 500) return 'retry';
  return 'drop';
}

/** Statuses the "Handled" segment shows - `confirmed`/`dismissed` rows are finished business. */
const HIDDEN_FROM_HANDLED: readonly InboundReceiptStatus[] = ['confirmed', 'dismissed'];

export const RETRYABLE_STATUSES: readonly InboundReceiptStatus[] = ['quota_exceeded', 'failed'];

export function canRetry(item: Pick<InboundReceiptListItem, 'status'>): boolean {
  return RETRYABLE_STATUSES.includes(item.status);
}

/**
 * Gmail's forwarding-verification mail is stored as a `pending` row of kind
 * `forwarding_verification`; it is a code for the settings screen, never an item
 * to confirm, so it is filtered out of both lists.
 */
export function visibleReceipts(
  items: readonly InboundReceiptListItem[],
  segment: 'pending' | 'handled',
  locallySaved: Readonly<Record<string, string>> = {},
): InboundReceiptListItem[] {
  return items.filter((item) => {
    if (item.kind !== 'receipt') return false;
    if (item.id in locallySaved) return false;
    if (segment === 'pending') return item.status === 'pending';
    return !HIDDEN_FROM_HANDLED.includes(item.status) && item.status !== 'pending';
  });
}

/** i18n key (under `emailReceipts.`) explaining why a handled item needs no confirmation. */
export function handledReasonKey(item: Pick<InboundReceiptListItem, 'status'>): string {
  switch (item.status) {
    case 'duplicate':
      return 'handledDuplicate';
    case 'not_a_receipt':
      return 'handledNotReceipt';
    case 'quota_exceeded':
      return 'handledQuota';
    case 'unsupported':
      return 'handledUnsupported';
    case 'failed':
      return 'handledFailed';
    default:
      return 'handledOther';
  }
}

export interface InboundPushData {
  type?: unknown;
  inboundReceiptId?: unknown;
}

export type InboundRoute =
  | { pathname: '/inbox/email-receipt'; params: { id: string } }
  | '/inbox/email-receipts';

/**
 * Where an `inbound_receipt` push goes. A single-item push carries the row id and
 * opens that item; the batched push, the quota push and the Gmail verification-code
 * push carry none and open the inbox, which links on to Settings when a code is waiting.
 */
export function inboundPushRoute(data: InboundPushData): InboundRoute {
  const id = typeof data.inboundReceiptId === 'string' ? data.inboundReceiptId : '';
  return id
    ? { pathname: '/inbox/email-receipt', params: { id } }
    : '/inbox/email-receipts';
}

/** i18n key (under `emailReceipts.`) for a failed address call. */
export function addressErrorKey(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'E2EE_UNSUPPORTED') return 'errorE2ee';
  return 'errorGeneric';
}

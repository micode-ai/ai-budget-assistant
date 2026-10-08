import type { InboundReceiptListItem } from '@budget/shared-types';
import {
  addressErrorKey,
  canRetry,
  confirmOutcome,
  handledReasonKey,
  inboundPushRoute,
  isFeatureUnavailable,
  visibleReceipts,
} from '../inboundMail';

function item(over: Partial<InboundReceiptListItem> = {}): InboundReceiptListItem {
  return {
    id: 'a',
    status: 'pending',
    kind: 'receipt',
    fromAddress: 'shop@biedronka.pl',
    fromDomain: 'biedronka.pl',
    subject: 'Paragon',
    total: 12.5,
    currencyCode: 'PLN',
    merchant: 'Biedronka',
    date: '2026-10-01',
    documentKind: 'pdf',
    errorCode: null,
    verificationCode: null,
    createdAt: '2026-10-01T10:00:00Z',
    expiresAt: '2026-10-31T10:00:00Z',
    ...over,
  };
}

describe('isFeatureUnavailable', () => {
  // Catches: treating only some failures as "flag off". A 404 must hide the feature; a
  // network error or 500 must NOT, or one bad request hides the inbox for the session.
  it('is true only for a 404', () => {
    expect(isFeatureUnavailable({ status: 404 })).toBe(true);
    expect(isFeatureUnavailable({ status: 500 })).toBe(false);
    expect(isFeatureUnavailable(new Error('Failed to fetch'))).toBe(false);
    expect(isFeatureUnavailable(null)).toBe(false);
  });
});

describe('confirmOutcome', () => {
  // Catches: dropping the confirm when it races the expense's own sync. The server
  // answers 404 until the offline-created expense has been pushed; dropping it leaves
  // the item pending forever and the user confirming the same receipt twice.
  it('retries a 404, a network failure, a 429 and a 5xx', () => {
    expect(confirmOutcome({ status: 404 })).toBe('retry');
    expect(confirmOutcome(new Error('Network request failed'))).toBe('retry');
    expect(confirmOutcome({ status: 429 })).toBe('retry');
    expect(confirmOutcome({ status: 503 })).toBe('retry');
  });

  // Catches: retrying forever on an answer that cannot change (already confirmed, viewer).
  it('drops a 409, 403, 400 and 410', () => {
    for (const status of [409, 403, 400, 410]) {
      expect(confirmOutcome({ status })).toBe('drop');
    }
  });
});

describe('visibleReceipts', () => {
  // Catches: Gmail's forwarding-verification row (status pending, kind
  // forwarding_verification) appearing as a receipt to confirm.
  it('never shows a verification row', () => {
    const rows = [item({ id: 'v', kind: 'forwarding_verification' }), item({ id: 'r' })];
    expect(visibleReceipts(rows, 'pending').map((i) => i.id)).toEqual(['r']);
    expect(visibleReceipts(rows, 'handled')).toEqual([]);
  });

  // Catches: an item the user just saved lingering in the list until the server acks.
  it('hides locally saved items from the pending list', () => {
    const rows = [item({ id: 'a' }), item({ id: 'b' })];
    expect(visibleReceipts(rows, 'pending', { a: 'exp-1' }).map((i) => i.id)).toEqual(['b']);
  });

  // Catches: the handled segment showing finished business (confirmed / dismissed) or
  // pending items, instead of the duplicate / not-a-receipt / quota / failed ones.
  it('keeps only the items that explain themselves in the handled segment', () => {
    const rows = [
      item({ id: '1', status: 'duplicate' }),
      item({ id: '2', status: 'not_a_receipt' }),
      item({ id: '3', status: 'quota_exceeded' }),
      item({ id: '4', status: 'failed' }),
      item({ id: '5', status: 'confirmed' }),
      item({ id: '6', status: 'dismissed' }),
      item({ id: '7', status: 'pending' }),
    ];
    expect(visibleReceipts(rows, 'handled').map((i) => i.id)).toEqual(['1', '2', '3', '4']);
    expect(visibleReceipts(rows, 'pending').map((i) => i.id)).toEqual(['7']);
  });
});

describe('canRetry / handledReasonKey', () => {
  // Catches: offering Retry on a duplicate or a not-a-receipt (the server refuses with
  // 409) and, the other way, hiding it where it would recover a lost extraction.
  it('retries only quota_exceeded and failed', () => {
    expect(canRetry({ status: 'quota_exceeded' })).toBe(true);
    expect(canRetry({ status: 'failed' })).toBe(true);
    expect(canRetry({ status: 'duplicate' })).toBe(false);
    expect(canRetry({ status: 'not_a_receipt' })).toBe(false);
  });

  it('explains every handled status with its own message', () => {
    expect(handledReasonKey({ status: 'duplicate' })).toBe('handledDuplicate');
    expect(handledReasonKey({ status: 'not_a_receipt' })).toBe('handledNotReceipt');
    expect(handledReasonKey({ status: 'quota_exceeded' })).toBe('handledQuota');
    expect(handledReasonKey({ status: 'unsupported' })).toBe('handledUnsupported');
    expect(handledReasonKey({ status: 'failed' })).toBe('handledFailed');
  });
});

describe('inboundPushRoute', () => {
  // Catches: a single-item push opening the list, or the batched / verification push
  // (no id) building an item route with an empty id.
  it('opens the item for a single-item push and the inbox otherwise', () => {
    expect(inboundPushRoute({ type: 'inbound_receipt', inboundReceiptId: 'abc' })).toEqual({
      pathname: '/inbox/email-receipt',
      params: { id: 'abc' },
    });
    expect(inboundPushRoute({ type: 'inbound_receipt' })).toBe('/inbox/email-receipts');
    expect(inboundPushRoute({ type: 'inbound_receipt', inboundReceiptId: '' })).toBe('/inbox/email-receipts');
    expect(inboundPushRoute({ type: 'inbound_receipt', inboundReceiptId: 42 })).toBe('/inbox/email-receipts');
  });
});

describe('addressErrorKey', () => {
  // Catches: the tier-2 refusal reading as a generic failure, so the user retries a
  // call that can never succeed on an end-to-end encrypted account.
  it('names the E2EE refusal', () => {
    expect(addressErrorKey({ code: 'E2EE_UNSUPPORTED' })).toBe('errorE2ee');
    expect(addressErrorKey(new Error('boom'))).toBe('errorGeneric');
  });
});

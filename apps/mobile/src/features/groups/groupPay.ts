import type { SettleMethod } from '@budget/shared-types';

/** Every way a payment can be recorded, in display order. */
export const SETTLE_METHODS: SettleMethod[] = ['blik', 'revolut', 'paypal', 'cash', 'other'];

export type PayInstruction = 'blik' | 'cash' | 'other';

export interface GroupPayLink {
  /** A tappable URL, or null when the method has none. */
  link: string | null;
  /** Free-text methods: the handle is shown to the payer as instructions instead. */
  instruction: PayInstruction | null;
}

/**
 * Pay deep link from the creditor's handle. The revolut.me / paypal.me shapes mirror the trip
 * wallet's `createPayment` (and the API's `buildGuestPayLink`) exactly. BLIK, cash and "other"
 * have no cross-app link, so they come back as instructions the screen renders as text.
 */
export function buildGroupPayLink(
  method: SettleMethod | null | undefined,
  handle: string | null | undefined,
  amount: number,
  currencyCode: string,
): GroupPayLink {
  const h = handle?.trim();
  if (!h) return { link: null, instruction: null };
  const amt = encodeURIComponent(String(amount));
  if (method === 'revolut') {
    return {
      link: `https://revolut.me/${encodeURIComponent(h)}?amount=${amt}&currency=${currencyCode}`,
      instruction: null,
    };
  }
  if (method === 'paypal') {
    return { link: `https://paypal.me/${encodeURIComponent(h)}/${amt}${currencyCode}`, instruction: null };
  }
  if (method === 'blik' || method === 'cash' || method === 'other') {
    return { link: null, instruction: method };
  }
  return { link: null, instruction: null };
}

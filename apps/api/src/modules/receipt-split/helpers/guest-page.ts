import type { GuestPageStrings } from './guest-page-i18n';

/**
 * Structured after modules/slack/helpers/oauth-pages.ts — a single self-contained
 * document, inline styles, no external assets. Every interpolated value MUST go
 * through this before landing in the returned HTML: the merchant, the payer's name,
 * the guest's own name, and every item description are all free text someone typed
 * (the payer, or an OCR/bank-statement pipeline), never trusted as safe markup.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pageShell(title: string, bodyHtml: string): string {
  // no-referrer: the token is a bearer credential embedded in this page's own
  // URL. Without this, tapping any outbound link (pay button, store badges)
  // would leak the full guest URL — including the token — to that link's
  // destination via the Referer header.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:32px auto;padding:0 20px;color:#1d1c1d;background:#fafafa}.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px;margin-bottom:16px}h1{font-size:19px;margin:8px 0 4px}.muted{color:#6b6b73;font-size:14px}.amount{font-size:36px;font-weight:700;margin:4px 0 12px}.items{margin:8px 0 16px;padding:0;list-style:none}.items li{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:14px}.btn{display:block;text-align:center;padding:14px;border-radius:8px;font-weight:600;text-decoration:none;margin:8px 0;border:none;width:100%;font-size:15px;font-family:inherit;cursor:pointer}.btn-primary{background:#E37F2B;color:#fff}.btn-secondary{background:#f5f5f5;color:#1d1c1d;border:1px solid #ddd}.blik-box{background:#f8f8f8;border-radius:8px;padding:12px;margin:8px 0;font-size:14px}form{margin:0}.footer{text-align:center;margin-top:20px;font-size:12px;color:#9a9aa3}.footer a{color:#9a9aa3}</style></head><body>${bodyHtml}</body></html>`;
}

/**
 * Rendered for an unknown token, an expired token, AND a cancelled token — these three
 * must be indistinguishable to the caller (an unknown/expired/cancelled-link enumeration
 * signal is exactly the kind of oracle a public, payment-adjacent page must never leak).
 * This function's output depends ONLY on `strings` (never on the token, never on any
 * per-request timestamp), so two calls with the same resolved language always produce
 * byte-identical output regardless of why the underlying lookup failed.
 */
export function renderNotFoundPage(strings: GuestPageStrings): string {
  const body = `<div class="card"><h1>${escapeHtml(strings.notFoundTitle)}</h1><p class="muted">${escapeHtml(strings.notFoundBody)}</p></div>`;
  return pageShell(strings.notFoundTitle, body);
}

export interface GuestPageItem {
  description: string;
  amount: number;
}

export type GuestPaymentStatus = 'sent' | 'opened' | 'claimed' | 'settled';

/**
 * Which instruction text to render in the box below the (missing) pay button — one
 * variant per method that has no tappable link, each with its own copy in
 * `guest-page-i18n.ts` (`blikInstructions` / `otherInstructions` / `cashInstructions`).
 */
export type GuestPayInstructionKind = 'blik' | 'other' | 'cash';

/**
 * One resolved payment method to render as its own block, in the order the caller
 * resolved them (DB `sortOrder`, or the single legacy pair). `handle` is free text the
 * payer typed — escaped by the renderer, never trusted as safe markup.
 */
export interface GuestPaymentMethodBlock {
  method: string;
  paymentLink: string | null;
  /** null = this method resolved to nothing renderable (e.g. no handle set, or an
   * unrecognized method) — the block is silently skipped. */
  instructions: GuestPayInstructionKind | null;
  handle: string;
}

export interface GuestPageModel {
  /** The participant's own name — free text the payer typed. Escaped by the renderer. */
  guestName: string;
  merchant: string | null;
  /** Pre-formatted (ISO yyyy-mm-dd) — locale-neutral, no Intl dependency. */
  dateLabel: string;
  payerName: string;
  /** The guest's OWN share only — never the bill total, never another participant's share. */
  amount: number;
  currencyCode: string;
  /** null = equal-split mode (no line items assigned) — never another participant's items. */
  items: GuestPageItem[] | null;
  status: GuestPaymentStatus;
  /** Ordered — one block rendered per entry. Empty = the payer offered no payment
   * method at all (renders the "no payment info" line instead). */
  paymentMethods: GuestPaymentMethodBlock[];
  /** Relative path the "I paid" form posts to, e.g. `/s/<token>/paid`. */
  postPaidAction: string;
}

/**
 * Pure link builder — the revolut.me / paypal.me branches mirror trip-settle-up.service.ts's
 * `createPayment` (lines ~177-184) exactly: same URL shapes, same encodeURIComponent'd
 * handle+amount. trip-settle-up's `createPayment` stops there (plus its own BLIK
 * manual-instructions fallback) — it does NOT have cash/other branches, so it no longer
 * mirrors this function's full behavior; do not assume the two stay in lockstep beyond
 * revolut/paypal/blik.
 *
 * blik/other/cash all have no tappable pay link, so each returns its own
 * `GuestPayInstructionKind` for the renderer to look up the right instruction copy:
 * BLIK has no cross-bank deep-link API (manual instructions), while 'other'/'cash' are
 * free-text-only methods by design (an IBAN, a card number, an in-person arrangement —
 * there is nothing to build a link from).
 */
export function buildGuestPayLink(
  paymentMethod: string | null | undefined,
  paymentHandle: string | null | undefined,
  amount: number,
  currencyCode: string,
): { paymentLink: string | null; instructions: GuestPayInstructionKind | null } {
  if (paymentMethod === 'revolut' && paymentHandle) {
    return {
      paymentLink: `https://revolut.me/${encodeURIComponent(paymentHandle)}?amount=${encodeURIComponent(String(amount))}&currency=${currencyCode}`,
      instructions: null,
    };
  }
  if (paymentMethod === 'paypal' && paymentHandle) {
    return {
      paymentLink: `https://paypal.me/${encodeURIComponent(paymentHandle)}/${encodeURIComponent(String(amount))}${currencyCode}`,
      instructions: null,
    };
  }
  if (paymentMethod === 'blik' && paymentHandle) {
    return { paymentLink: null, instructions: 'blik' };
  }
  if (paymentMethod === 'other' && paymentHandle) {
    return { paymentLink: null, instructions: 'other' };
  }
  if (paymentMethod === 'cash' && paymentHandle) {
    return { paymentLink: null, instructions: 'cash' };
  }
  return { paymentLink: null, instructions: null };
}

const STORE_URL_ANDROID = 'https://play.google.com/store/apps/details?id=com.budget.assistant';
// Placeholder until an App Store ID is assigned — same precedent as app-versions.service.ts.
const STORE_URL_IOS = 'https://apps.apple.com/app/id000000000';

/**
 * Renders the guest's own view of a receipt split. Content order (binding, per the task
 * brief): merchant + date, "«Payer» paid for everyone", the guest's own items, their
 * amount in large type, a pay button / BLIK instructions, an "I paid" button, store links.
 *
 * Every field on `model` is expected to already be scoped to THIS participant only — the
 * caller (guest.controller.ts) must never pass in another participant's name/amount/items
 * or the accountId. This function does not fetch anything and cannot leak what it isn't
 * given, but it still escapes everything on the way out as defense in depth.
 */
export function renderGuestPage(model: GuestPageModel, strings: GuestPageStrings): string {
  const merchantLabel = model.merchant ? escapeHtml(model.merchant) : escapeHtml(strings.genericMerchant);

  const itemsHtml =
    model.items && model.items.length > 0
      ? `<div class="muted">${escapeHtml(strings.yourItemsHeading)}</div><ul class="items">${model.items
          .map(
            (item) =>
              `<li><span>${escapeHtml(item.description)}</span><span>${item.amount.toFixed(2)}</span></li>`,
          )
          .join('')}</ul>`
      : `<p class="muted">${escapeHtml(strings.equalShareNote)}</p>`;

  // Once the guest has said they paid (claimed) or the payer has confirmed it
  // (settled), offering a pay button / BLIK box next to that confirmation is
  // confusing at best and asks for a duplicate payment at worst — render it only
  // while the participant has not yet claimed payment.
  const hasClaimedPayment = model.status === 'claimed' || model.status === 'settled';

  let payHtml = '';
  if (!hasClaimedPayment) {
    // One block per resolved method, in order — a button for each link-capable method
    // (revolut/paypal), an instructions box for every method that has none (blik/other/
    // cash, each with its own copy — see `GuestPayInstructionKind`). A method that
    // resolves to neither (no handle set, or unrecognized) renders nothing and is
    // silently skipped — it is not "no payment info" on its own, only when EVERY method
    // skips does that line appear. Each button reuses the same `payButton` text
    // regardless of method; distinguishing multiple buttons by brand name would need new
    // copy, which is out of scope here (i18n is owned elsewhere).
    const blocks = model.paymentMethods
      .map((block) => {
        if (block.paymentLink) {
          return `<a class="btn btn-primary" rel="noreferrer" href="${escapeHtml(block.paymentLink)}">${escapeHtml(strings.payButton(model.payerName))}</a>`;
        }
        if (block.instructions === 'blik') {
          return `<div class="blik-box">${escapeHtml(strings.blikInstructions(block.handle))}</div>`;
        }
        if (block.instructions === 'other') {
          return `<div class="blik-box">${escapeHtml(strings.otherInstructions(block.handle))}</div>`;
        }
        if (block.instructions === 'cash') {
          return `<div class="blik-box">${escapeHtml(strings.cashInstructions(block.handle))}</div>`;
        }
        return null;
      })
      .filter((html): html is string => html !== null);

    payHtml = blocks.length > 0 ? blocks.join('') : `<p class="muted">${escapeHtml(strings.noPaymentInfo)}</p>`;
  }

  let actionHtml: string;
  if (model.status === 'settled') {
    actionHtml = `<p class="muted">${escapeHtml(strings.settledNotice)}</p>`;
  } else if (model.status === 'claimed') {
    actionHtml = `<p class="muted">${escapeHtml(strings.claimedNotice)}</p>`;
  } else {
    actionHtml = `<form method="post" action="${escapeHtml(model.postPaidAction)}"><button type="submit" class="btn btn-secondary">${escapeHtml(strings.iPaidButton)}</button></form>`;
  }

  const body = `<div class="card">
    <div class="muted">${merchantLabel} · ${escapeHtml(model.dateLabel)}</div>
    <h1>${escapeHtml(strings.greeting(model.guestName))}</h1>
    <div class="muted">${escapeHtml(strings.paidByLine(model.payerName))}</div>
    ${itemsHtml}
    <div class="muted">${escapeHtml(strings.yourShareLabel)}</div>
    <div class="amount">${model.amount.toFixed(2)} ${escapeHtml(model.currencyCode)}</div>
    ${payHtml}
    ${actionHtml}
  </div>
  <div class="footer">
    <div>${escapeHtml(strings.poweredBy)}</div>
    <div><a rel="noreferrer" href="${STORE_URL_ANDROID}">${escapeHtml(strings.getAndroid)}</a> · <a rel="noreferrer" href="${STORE_URL_IOS}">${escapeHtml(strings.getIos)}</a></div>
  </div>`;

  return pageShell(strings.title(model.merchant ?? strings.genericMerchant), body);
}

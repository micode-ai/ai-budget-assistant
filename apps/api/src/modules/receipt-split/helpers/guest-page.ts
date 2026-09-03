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
  //
  // `*,*::before,*::after{box-sizing:border-box}` — the root fix for the pay button
  // overflowing its card: `.btn{width:100%;padding:14px}` sits inside `.card{padding:20px}`
  // inside `body{max-width:...px;padding:0 20px}`; under the default content-box every one
  // of those paddings is ADDED on top of the element's own width, so `.btn`'s rendered
  // width was the card's content width PLUS the button's own 28px of horizontal padding —
  // hanging outside the card on every phone. Border-box folds an element's own padding (and
  // border) back inside its declared width, so `width:100%` means "100% of the parent, pad
  // included" everywhere on this page — the next full-width control added here inherits the
  // fix for free instead of needing its own padding shaved by hand.
  //
  // Checked every other fixed-width/padded rule in this sheet against the reset:
  // `.card`, `.blik-box`, `.items li`, `.footer` — none of them declare a `width` or
  // `max-width`, only `padding`/`margin`, and an auto-width block's rendered size is
  // identical under either box model (padding is already accounted for inside the
  // available space the browser hands it) — so none of them shift by a pixel.
  // `body` is the one exception: it combines `max-width` WITH `padding`, so border-box
  // would have shrunk its usable content width by the 40px of padding on wide (desktop
  // preview) viewports — invisible on an actual phone, where the viewport is already
  // under 480px and `max-width` never binds, but a real behavior change on a wide screen.
  // Compensated by widening `max-width` to 520px (480 + the 2×20px padding) so the
  // rendered content width stays exactly 480px either way — pixel-identical to before on
  // every viewport, not just phones.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:32px auto;padding:0 20px;color:#1d1c1d;background:#fafafa}.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px;margin-bottom:16px}h1{font-size:19px;margin:8px 0 4px}.muted{color:#6b6b73;font-size:14px}.amount{font-size:36px;font-weight:700;margin:4px 0 12px}.items{margin:8px 0 16px;padding:0;list-style:none}.items li{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:14px}.btn{display:block;text-align:center;padding:14px;border-radius:8px;font-weight:600;text-decoration:none;margin:8px 0;border:none;width:100%;font-size:15px;font-family:inherit;cursor:pointer}.btn-primary{background:#E37F2B;color:#fff}.btn-secondary{background:#f5f5f5;color:#1d1c1d;border:1px solid #ddd}.blik-box{background:#f8f8f8;border-radius:8px;padding:12px;margin:8px 0;font-size:14px}.pay-method{font-weight:600;font-size:13px;margin-bottom:4px}.pay-handle{color:#6b6b73;font-size:13px;margin-bottom:8px}form{margin:0}.footer{text-align:center;margin-top:20px;font-size:12px;color:#9a9aa3}.footer a{color:#9a9aa3}.cta{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-top:20px;text-align:center}.cta-title{font-size:14px;font-weight:600;margin-bottom:12px}.btn-cta{background:#E37F2B;color:#fff}.cta .play{display:inline-block;margin-top:6px;font-size:13px;color:#6b6b73}</style></head><body>${bodyHtml}</body></html>`;
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

/**
 * The primary call to action points at the WEB app, not a store.
 *
 * This page used to offer "Download on the App Store" against a placeholder id
 * (`id000000000`) that has never resolved, so every iPhone guest — plausibly
 * half of them — was handed a dead link. There is still no native iOS app, but
 * the web app runs everywhere and needs no install, which makes it the only
 * honest primary action. Google Play stays as a secondary link for Android.
 *
 * `src`/`loc` follow the ABA-436 tagging scheme so this channel is attributable
 * instead of landing in the direct bucket. It is a real acquisition surface:
 * the visitor is a non-user who opened our page and often paid through it.
 */
const APP_URL = 'https://app.ai-budget.pl/?src=split&loc=guest';

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
    // skips does that line appear.
    //
    // Every block states its own destination method (`strings.methodLabel`, keyed off
    // the enum-constrained `block.method` — a Prisma `SettleMethod` column, never
    // attacker-controlled free text the way `handle` is) so two link-capable methods
    // (e.g. Revolut + PayPal) render as two visually DIFFERENT buttons instead of two
    // identical "Pay «Payer»" buttons with no way to tell which account either one
    // pays into. The button no longer repeats the payer's name — `paidByLine` above it
    // on the card already says who paid — which also removes the trailing-space
    // artifact a bare `payButton(payerName)` produced whenever the payer's stored name
    // itself had trailing whitespace. Each button is immediately followed by its own
    // handle in a muted line right underneath, so the guest sees exactly which account
    // a tap will pay before tapping. Instruction-only blocks (blik/other/cash) get the
    // same method-name heading above their existing copy, so all three read apart at a
    // glance too when more than one is offered together.
    const blocks = model.paymentMethods
      .map((block) => {
        const methodLabel = strings.methodLabel(block.method);
        if (block.paymentLink) {
          return `<a class="btn btn-primary" rel="noreferrer" href="${escapeHtml(block.paymentLink)}">${escapeHtml(strings.payButton(methodLabel))}</a><div class="pay-handle">${escapeHtml(block.handle)}</div>`;
        }
        if (block.instructions === 'blik') {
          return `<div class="blik-box"><div class="pay-method">${escapeHtml(methodLabel)}</div><div>${escapeHtml(strings.blikInstructions(block.handle))}</div></div>`;
        }
        if (block.instructions === 'other') {
          return `<div class="blik-box"><div class="pay-method">${escapeHtml(methodLabel)}</div><div>${escapeHtml(strings.otherInstructions(block.handle))}</div></div>`;
        }
        if (block.instructions === 'cash') {
          return `<div class="blik-box"><div class="pay-method">${escapeHtml(methodLabel)}</div><div>${escapeHtml(strings.cashInstructions(block.handle))}</div></div>`;
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
  <div class="cta">
    <!-- Deliberately NOT .btn-primary: that class means "a payment action is
         available" and the suite asserts on it to prove the pay affordance
         disappears once a share is claimed. An acquisition link must never be
         able to satisfy that assertion. -->
    <div class="cta-title">${escapeHtml(strings.poweredBy)}</div>
    <a class="btn btn-cta" rel="noreferrer" href="${APP_URL}">${escapeHtml(strings.ctaButton)}</a>
    <a class="play" rel="noreferrer" href="${STORE_URL_ANDROID}">${escapeHtml(strings.getAndroid)}</a>
  </div>`;

  return pageShell(strings.title(model.merchant ?? strings.genericMerchant), body);
}

// --- Group picker (ABA — QR-code bill split). One QR-able link per split
// that lets every participant scan the same code and pick their own name,
// instead of the payer delivering N distinct per-person links one at a time.
// Both functions below are strictly NAMES-ONLY — never an amount, never a
// payment status, never another participant's real token — see
// docs/contracts/qr-code-bill-split-api.md for the full leak analysis. ---

export interface GroupPickerEntry {
  /** Free text the payer typed — escaped by the renderer, never trusted as
   * safe markup. */
  name: string;
  /** Points at THIS entry's own confirm step (`/s/g/:groupToken/:seq`), never
   * directly at a real per-participant `/s/:token` — see
   * `renderGroupConfirmPage` below. */
  href: string;
}

export interface GroupPickerModel {
  merchant: string | null;
  entries: GroupPickerEntry[];
}

/** Rendered for `GET /s/g/:groupToken`. Lists participant names only, each
 * linking to its own confirm step — never a bare list of real per-participant
 * links, so a stray tap can't land straight in someone else's payment page. */
export function renderGroupPickerPage(model: GroupPickerModel, strings: GuestPageStrings): string {
  const merchantLabel = model.merchant ?? strings.genericMerchant;
  const title = strings.groupPickerTitle(escapeHtml(merchantLabel));

  const rows = model.entries
    .map(
      (entry) =>
        `<a class="btn btn-secondary" href="${escapeHtml(entry.href)}">${escapeHtml(entry.name)}</a>`,
    )
    .join('');

  const body = `<div class="card">
    <h1>${title}</h1>
    <p class="muted">${escapeHtml(strings.groupPickerHint)}</p>
    ${rows}
  </div>`;

  return pageShell(strings.groupPickerTitle(merchantLabel), body);
}

export interface GroupConfirmModel {
  /** Free text the payer typed — escaped by the renderer. */
  name: string;
  /** The one place this whole group-picker code path reveals a real
   * per-participant `/s/:token` — scoped to the entry the guest just
   * self-selected on the picker page above. */
  yesHref: string;
  /** Back to the picker page (`/s/g/:groupToken`) — never leaks anything new. */
  noHref: string;
}

/** Rendered for `GET /s/g/:groupToken/:seq` — the "is this you?" gate that
 * answers the wrong-tap open question without touching the existing,
 * already-hardened `/s/:token` handler at all. */
export function renderGroupConfirmPage(model: GroupConfirmModel, strings: GuestPageStrings): string {
  const question = strings.pickedConfirmQuestion(escapeHtml(model.name));
  const body = `<div class="card">
    <h1>${question}</h1>
    <a class="btn btn-primary" href="${escapeHtml(model.yesHref)}">${escapeHtml(strings.pickedConfirmYes)}</a>
    <a class="btn btn-secondary" href="${escapeHtml(model.noHref)}">${escapeHtml(strings.pickedConfirmNo)}</a>
  </div>`;
  return pageShell(strings.pickedConfirmQuestion(model.name), body);
}

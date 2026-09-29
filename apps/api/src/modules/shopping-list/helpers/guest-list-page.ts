import type { GuestListPageStrings } from './guest-list-page-i18n';

/**
 * Structured after `receipt-split/helpers/guest-page.ts` (own copy, not an
 * import — see the header comment on `guest-list-page-i18n.ts` for why).
 * Every interpolated value MUST go through `escapeHtml` before landing in
 * the returned HTML: the list name and every item label are free text a
 * member typed, never trusted as safe markup.
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
  // no-referrer: the token is a bearer credential embedded in this page's
  // own URL — without this, an outbound link (the CTA button) would leak the
  // full guest URL, token included, via the Referer header.
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:32px auto;padding:0 20px;color:#1d1c1d;background:#fafafa}.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px;margin-bottom:16px}h1{font-size:19px;margin:8px 0 4px}.muted{color:#6b6b73;font-size:14px;margin:0 0 12px}.items{margin:8px 0 0;padding:0;list-style:none}.items li{border-bottom:1px solid #f0f0f0}.items li:last-child{border-bottom:none}.item-row{display:flex;align-items:center;gap:10px;padding:10px 0}.box{width:20px;height:20px;flex-shrink:0;border:2px solid #c7c7cc;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:13px;line-height:1}.item-checked .box{background:#E37F2B;border-color:#E37F2B}.item-row button:focus-visible{outline:2px solid #E37F2B;outline-offset:2px;border-radius:6px}.item-label{font-size:15px;flex:1}.item-checked .item-label{text-decoration:line-through;color:#9a9aa3}.item-qty{color:#9a9aa3;font-size:13px}.item-price{color:#1d1c1d;font-size:14px;white-space:nowrap}.item-checked .item-price{color:#9a9aa3;text-decoration:line-through}.totals{border-top:1px solid #e5e5e5;margin-top:8px;padding-top:12px}.total-row{display:flex;justify-content:space-between;gap:12px;font-size:15px}.total-sub{color:#6b6b73;font-size:13px;margin-top:4px}form{margin:0}.item-row button{all:unset;display:flex;align-items:center;gap:10px;width:100%;cursor:pointer;text-align:left}.footer{text-align:center;margin-top:20px;font-size:12px;color:#9a9aa3}.cta{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-top:20px;text-align:center}.cta-title{font-size:14px;font-weight:600;margin-bottom:12px}.btn{display:inline-block;text-align:center;padding:12px 20px;border-radius:8px;font-weight:600;text-decoration:none;background:#E37F2B;color:#fff;font-size:14px}.cta .play{display:block;margin-top:8px;font-size:12px;color:#6b6b73}</style></head><body>${bodyHtml}</body></html>`;
}

/**
 * Rendered for an unknown token, a revoked token, AND a token whose list is
 * now archived/deleted — all collapse to the same output, same reasoning as
 * `receipt-split/helpers/guest-page.ts`'s `renderNotFoundPage`: never
 * confirm to an outside visitor that a link *used to* work.
 */
export function renderListNotFoundPage(strings: GuestListPageStrings): string {
  const body = `<div class="card"><h1>${escapeHtml(strings.notFoundTitle)}</h1><p class="muted">${escapeHtml(strings.notFoundBody)}</p></div>`;
  return pageShell(strings.notFoundTitle, body);
}

export interface GuestListPageItem {
  id: string;
  rawLabel: string;
  quantity: number;
  /** Price per unit in the list's currency; null = not priced. */
  unitPrice: number | null;
  isChecked: boolean;
}

export interface GuestListPageModel {
  listName: string;
  /** The account's currency — every price on the list is in it. */
  currencyCode: string;
  items: GuestListPageItem[];
  /** `/sl/{token}/items/{itemId}/toggle` — the form action for every item row. */
  toggleActionBase: string;
}

/** Formats money for the page; falls back to "12.50 PLN" for a currency ICU does not know. */
export function formatGuestMoney(amount: number, currencyCode: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

function lineTotal(item: GuestListPageItem): number | null {
  return item.unitPrice == null ? null : Math.round(item.unitPrice * item.quantity * 100) / 100;
}

export function renderGuestListPage(model: GuestListPageModel, strings: GuestListPageStrings): string {
  const money = (n: number) => formatGuestMoney(n, model.currencyCode, strings.intlLocale);
  const itemsHtml = model.items.length
    ? `<ul class="items">${model.items
        .map((item) => {
          const qty = item.quantity > 1 ? ` <span class="item-qty">×${escapeHtml(String(item.quantity))}</span>` : '';
          const line = lineTotal(item);
          const price = line == null ? '' : `<span class="item-price">${escapeHtml(money(line))}</span>`;
          // The whole row is one `<button type="submit">` — plain HTML forms
          // only, no `<script>` tag anywhere on this page, same posture as the
          // receipt-split guest page. The tick box is a drawn span, not an
          // <input>: a `disabled` checkbox inside the button swallowed the
          // click, so tapping the box itself submitted nothing. `item-row` is
          // the class the stylesheet targets; without it the row rendered as
          // a bare browser button.
          return `<li class="${item.isChecked ? 'item-checked' : ''}"><form class="item-row" method="post" action="${escapeHtml(model.toggleActionBase)}/${encodeURIComponent(item.id)}/toggle"><button type="submit" aria-pressed="${item.isChecked ? 'true' : 'false'}"><span class="box" aria-hidden="true">${item.isChecked ? '✓' : ''}</span><span class="item-label">${escapeHtml(item.rawLabel)}${qty}</span>${price}</button></form></li>`;
        })
        .join('')}</ul>`
    : `<p class="muted">${escapeHtml(strings.emptyList)}</p>`;

  const priced = model.items.filter((i) => i.unitPrice != null);
  let totalsHtml = '';
  if (priced.length > 0) {
    const sum = (rows: GuestListPageItem[]) => Math.round(rows.reduce((acc, i) => acc + (lineTotal(i) ?? 0), 0) * 100) / 100;
    const total = sum(priced);
    const remaining = sum(priced.filter((i) => !i.isChecked));
    const allRow = remaining !== total
      ? `<div class="total-row total-sub"><span>${escapeHtml(strings.totalAll)}</span><span>${escapeHtml(money(total))}</span></div>`
      : '';
    totalsHtml = `<div class="totals"><div class="total-row"><span>${escapeHtml(strings.totalRemaining)}</span><strong>${escapeHtml(money(remaining))}</strong></div>${allRow}</div>`;
  }

  const body = `<div class="card"><h1>${escapeHtml(model.listName)}</h1><p class="muted">${escapeHtml(strings.subheading)}</p>${itemsHtml}${totalsHtml}</div><div class="cta"><div class="cta-title">${escapeHtml(strings.poweredBy)}</div><a class="btn" href="https://ai-budget.pl" rel="noopener">${escapeHtml(strings.ctaButton)}</a><span class="play">${escapeHtml(strings.getAndroid)}</span></div>`;
  return pageShell(strings.title(model.listName), body);
}

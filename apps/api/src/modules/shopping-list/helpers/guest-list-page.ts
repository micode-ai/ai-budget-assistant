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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:32px auto;padding:0 20px;color:#1d1c1d;background:#fafafa}.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px;margin-bottom:16px}h1{font-size:19px;margin:8px 0 4px}.muted{color:#6b6b73;font-size:14px;margin:0 0 12px}.items{margin:8px 0 0;padding:0;list-style:none}.items li{border-bottom:1px solid #f0f0f0}.items li:last-child{border-bottom:none}.item-row{display:flex;align-items:center;gap:10px;padding:10px 0}.item-row input[type=checkbox]{width:20px;height:20px;flex-shrink:0}.item-label{font-size:15px;flex:1}.item-checked .item-label{text-decoration:line-through;color:#9a9aa3}.item-qty{color:#9a9aa3;font-size:13px}form{margin:0}.item-row button{all:unset;display:flex;align-items:center;gap:10px;width:100%;cursor:pointer;text-align:left}.footer{text-align:center;margin-top:20px;font-size:12px;color:#9a9aa3}.cta{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-top:20px;text-align:center}.cta-title{font-size:14px;font-weight:600;margin-bottom:12px}.btn{display:inline-block;text-align:center;padding:12px 20px;border-radius:8px;font-weight:600;text-decoration:none;background:#E37F2B;color:#fff;font-size:14px}.cta .play{display:block;margin-top:8px;font-size:12px;color:#6b6b73}</style></head><body>${bodyHtml}</body></html>`;
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
  isChecked: boolean;
}

export interface GuestListPageModel {
  listName: string;
  items: GuestListPageItem[];
  /** `/sl/{token}/items/{itemId}/toggle` — the form action for every item row. */
  toggleActionBase: string;
}

export function renderGuestListPage(model: GuestListPageModel, strings: GuestListPageStrings): string {
  const itemsHtml = model.items.length
    ? `<ul class="items">${model.items
        .map((item) => {
          const qty = item.quantity > 1 ? ` <span class="item-qty">×${escapeHtml(String(item.quantity))}</span>` : '';
          // The checkbox is `disabled` — purely decorative, since it has no
          // `name` and would never be submitted anyway. The surrounding
          // `<button type="submit">` is what toggles the item: plain HTML
          // forms only, no `<script>` tag anywhere on this page, same
          // posture as the receipt-split guest page.
          return `<li class="${item.isChecked ? 'item-checked' : ''}"><form method="post" action="${escapeHtml(model.toggleActionBase)}/${encodeURIComponent(item.id)}/toggle"><button type="submit"><input type="checkbox" ${item.isChecked ? 'checked' : ''} disabled><span class="item-label">${escapeHtml(item.rawLabel)}${qty}</span></button></form></li>`;
        })
        .join('')}</ul>`
    : `<p class="muted">${escapeHtml(strings.emptyList)}</p>`;

  const body = `<div class="card"><h1>${escapeHtml(model.listName)}</h1><p class="muted">${escapeHtml(strings.subheading)}</p>${itemsHtml}</div><div class="cta"><div class="cta-title">${escapeHtml(strings.poweredBy)}</div><a class="btn" href="https://ai-budget.pl" rel="noopener">${escapeHtml(strings.ctaButton)}</a><span class="play">${escapeHtml(strings.getAndroid)}</span></div>`;
  return pageShell(strings.title(model.listName), body);
}

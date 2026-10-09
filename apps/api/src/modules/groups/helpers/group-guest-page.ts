import { escapeHtml } from '../../receipt-split/helpers/guest-page';
import type { GroupGuestStrings, GroupStrKey } from './group-guest-page-i18n';

/**
 * Server-rendered, script-free HTML for the public group page (`/g/:token`, ABA-640). Plain
 * `<form method="post">`, no `<script>`, inline styles. EVERY interpolated value goes through
 * `escapeHtml` (names, descriptions, handles and currency are free text or DB text).
 *
 * The model handed in is already scoped to ONE group and carries no `userId`, email, `accountId`
 * or app-user flag, so this file cannot leak what it never receives.
 *
 * Install prompts use `.btn-cta`, never `.btn-primary` (the receipt-split page's marker for the
 * pay affordance, and the class is deliberately absent from this stylesheet). No iOS store link.
 */

const STORE_URL_ANDROID = 'https://play.google.com/store/apps/details?id=com.budget.assistant';
const APP_BASE = 'https://app.ai-budget.pl/';

export type CtaMoment = 'added' | 'form' | 'settled';

export interface GuestMemberView {
  id: string;
  name: string;
  balance: number;
}

export interface GuestTransferPay {
  /** Tappable pay link (revolut / paypal), or null. */
  link: string | null;
  method: string;
  handle: string;
  /** blik / other / cash have no link: the handle is shown as plain text. */
  textOnly: boolean;
}

export interface GuestTransferView {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  amount: number;
  /** ABA-652: the most this pair can settle now, min(owed, owed-to); at least `amount`. */
  maxAmount: number;
  /** The viewing (cookie-identified) member is the payer or the receiver of this transfer. */
  canSettle: boolean;
  iAmReceiver: boolean;
  /** Only ever set for the payer's own row. */
  pay: GuestTransferPay | null;
}

export type GuestActivityView =
  | {
      kind: 'expense';
      id: string;
      description: string;
      /** Group (ledger) currency. */
      amount: number;
      /** ABA-654: the amount as entered in another currency; null when entered in the group currency. */
      original: { amount: number; currencyCode: string; manualRate?: boolean } | null;
      date: string;
      paidByName: string;
      /** Set only when the creator is not the payer, so a framing expense stays visible. */
      addedByName: string | null;
      deleted: boolean;
      canDelete: boolean;
    }
  | {
      kind: 'settlement';
      id: string;
      fromName: string;
      toName: string;
      amount: number;
      voided: boolean;
      canVoid: boolean;
    }
  | {
      /** ABA-650: only `member_merged` ever reaches the page (an app-user status must never show). */
      kind: 'event';
      id: string;
      subjectName: string;
      targetName: string;
    };

/** ABA-655: one open itemised receipt on the guest page. Lines and totals in `itemCurrency`. */
export interface GuestClaimReceiptView {
  id: string;
  description: string;
  /** Group currency. */
  amount: number;
  itemCurrency: string;
  payerName: string;
  /** YYYY-MM-DD, the last day members can claim. */
  openUntil: string;
  /** The viewer's total over their claimed lines. */
  myTotal: number;
  lines: {
    id: string;
    name: string;
    price: number;
    claimants: number;
    /** Explicit shares set by the payer: shown read-only, never part of the form. */
    handSplit: boolean;
    mine: boolean;
    myPart: number;
  }[];
}

export interface GroupPageModel {
  token: string;
  lang: string;
  groupName: string;
  emoji: string | null;
  currencyCode: string;
  /** ABA-654: the add form's currency options, the group currency first. */
  entryCurrencies: string[];
  archived: boolean;
  me: null | {
    id: string;
    name: string;
    csrf: string;
    paymentMethod: string | null;
    paymentHandle: string | null;
    /** Present only on the one render right after joining. */
    restoreCode: string | null;
  };
  claimable: { id: string; name: string }[];
  members: GuestMemberView[];
  transfers: GuestTransferView[];
  ledgerVersion: number;
  activity: GuestActivityView[];
  nextBefore: string | null;
  /** ABA-655: open itemised receipts the viewer can claim lines on (at most 5). */
  receipts: GuestClaimReceiptView[];
  /** ABA-655: some receipt is still being divided, so the settle form warns that amounts may move. */
  claimsOpen: boolean;
  /** Fresh idempotency nonce for this render's forms. */
  rid: string;
  flash: string | null;
  showAndroidAppButton: boolean;
  today: string;
}

const CSS =
  '*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:24px auto;padding:0 16px;color:#1d1c1d;background:#fafafa}' +
  '.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-bottom:16px}h1{font-size:20px;margin:4px 0 8px}h2{font-size:16px;margin:0 0 10px}' +
  '.muted{color:#6b6b73;font-size:14px}.row{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:14px}.row:last-child{border-bottom:none}' +
  '.pos{color:#1a7f37}.neg{color:#b3261e}.struck{text-decoration:line-through;color:#9a9aa3}.tag{font-size:11px;color:#6b6b73;border:1px solid #ddd;border-radius:6px;padding:0 6px;margin-left:6px}' +
  'label{display:block;font-size:13px;color:#6b6b73;margin:10px 0 4px}input[type=text],input[type=number],input[type=date],select{width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:15px;font-family:inherit;background:#fff}' +
  '.pick{display:flex;gap:8px;align-items:center;margin:6px 0;font-size:14px}.pick input[type=number]{width:110px}.pick span{flex:1}' +
  '.btn{display:block;text-align:center;padding:12px;border-radius:8px;font-weight:600;text-decoration:none;margin:8px 0;border:none;width:100%;font-size:15px;font-family:inherit;cursor:pointer}' +
  '.btn-main{background:#1d1c1d;color:#fff}.btn-secondary{background:#f5f5f5;color:#1d1c1d;border:1px solid #ddd}.btn-small{display:inline-block;width:auto;padding:6px 10px;font-size:12px;margin:0}' +
  '.flash{background:#fff8e1;border:1px solid #f0d98c;border-radius:10px;padding:10px 12px;margin-bottom:16px;font-size:14px}' +
  '.inline{display:inline}form{margin:0}details summary{cursor:pointer;font-size:13px;color:#6b6b73}.code{word-break:break-all;font-size:12px;background:#f8f8f8;padding:8px;border-radius:6px;margin-top:6px}' +
  '.cta{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center}.cta-title{font-size:14px;font-weight:600;margin-bottom:10px}.btn-cta{background:#E37F2B;color:#fff}.cta .play{display:inline-block;margin-top:6px;font-size:13px;color:#6b6b73}';

function pageShell(lang: string, title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="same-origin"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body>${bodyHtml}</body></html>`;
}

/** A page with a title and one paragraph. Depends only on `strings` + the keys it is given. */
function messagePage(s: GroupGuestStrings, titleKey: GroupStrKey, bodyKey: GroupStrKey): string {
  const body = `<div class="card"><h1>${escapeHtml(s.t(titleKey))}</h1><p class="muted">${escapeHtml(s.t(bodyKey))}</p></div>`;
  return pageShell(s.lang, s.t(titleKey), body);
}

/**
 * Rendered for an unknown token, `guestAccess = false` and a deleted group alike. Its output
 * depends ONLY on the resolved language, never on the token or the reason the lookup failed, so
 * the three cases are byte-identical.
 */
export function renderGroupNotFoundPage(s: GroupGuestStrings): string {
  return messagePage(s, 'notFoundTitle', 'notFoundBody');
}

export function renderGroupBusyPage(s: GroupGuestStrings): string {
  return messagePage(s, 'busyTitle', 'busyBody');
}

export function renderGroupInvalidPage(s: GroupGuestStrings): string {
  return messagePage(s, 'invalidTitle', 'invalidBody');
}

export function formatAmount(amount: number, currencyCode: string): string {
  return `${amount.toFixed(2)} ${currencyCode}`;
}

const FLASH_KEYS: Record<string, GroupStrKey> = {
  joined: 'msgJoined',
  taken: 'msgTaken',
  nameclash: 'msgNameClash',
  invalid: 'msgInvalid',
  changed: 'msgChanged',
  forbidden: 'msgForbidden',
  limit: 'msgLimit',
  saved: 'msgSaved',
  added: 'msgAdded',
  addedfx: 'msgAddedFx',
  norate: 'msgNoRate',
  settled: 'msgSettled',
  linkfailed: 'msgLinkFailed',
  badcode: 'msgBadCode',
  alreadyin: 'msgAlreadyIn',
  toomuch: 'msgTooMuch',
  claimed: 'msgClaimed',
  claimsclosed: 'msgClaimsClosed',
  busy: 'msgBusy',
};

export const FLASH_CODES = [...Object.keys(FLASH_KEYS), 'archived'];

const CTA_KEYS: Record<CtaMoment, GroupStrKey> = {
  added: 'ctaAdded',
  form: 'ctaReceipt',
  settled: 'ctaSettled',
};

function ctaCard(s: GroupGuestStrings, moment: CtaMoment): string {
  const href = `${APP_BASE}?src=group&loc=${moment}&lang=${encodeURIComponent(s.lang)}`;
  return `<div class="cta"><div class="cta-title">${escapeHtml(s.t(CTA_KEYS[moment]))}</div><a class="btn btn-cta" rel="noreferrer" href="${escapeHtml(href)}">${escapeHtml(s.t('ctaButton'))}</a><a class="play" rel="noreferrer" href="${STORE_URL_ANDROID}">${escapeHtml(s.t('getAndroid'))}</a></div>`;
}

function methodName(s: GroupGuestStrings, method: string): string {
  if (method === 'blik') return 'BLIK';
  if (method === 'revolut') return 'Revolut';
  if (method === 'paypal') return 'PayPal';
  if (method === 'cash') return s.t('methodCash');
  return s.t('methodOther');
}

function actionUrl(m: GroupPageModel, path: string): string {
  return `/g/${encodeURIComponent(m.token)}${path}?lang=${encodeURIComponent(m.lang)}`;
}

function csrfField(m: GroupPageModel): string {
  return m.me ? `<input type="hidden" name="csrf" value="${escapeHtml(m.me.csrf)}">` : '';
}

function activityRows(m: GroupPageModel, s: GroupGuestStrings, allowActions: boolean): string {
  if (m.activity.length === 0) return `<p class="muted">${escapeHtml(s.t('noHistory'))}</p>`;
  return m.activity
    .map((a) => {
      if (a.kind === 'event') {
        return `<div class="row"><div class="muted">${escapeHtml(s.t('eventMerged', a.subjectName, a.targetName))}</div></div>`;
      }
      if (a.kind === 'expense') {
        const del =
          allowActions && a.canDelete && !a.deleted && m.me
            ? `<form class="inline" method="post" action="${escapeHtml(actionUrl(m, `/expenses/${encodeURIComponent(a.id)}/delete`))}">${csrfField(m)}<button class="btn btn-secondary btn-small" type="submit">${escapeHtml(s.t('deleteButton'))}</button></form>`
            : '';
        const tag = a.deleted ? `<span class="tag">${escapeHtml(s.t('deletedTag'))}</span>` : '';
        return `<div class="row"><div class="${a.deleted ? 'struck' : ''}">${escapeHtml(a.description)}${tag}<div class="muted">${escapeHtml(a.date)} · ${escapeHtml(s.t('expensePaidBy', a.paidByName))}${a.addedByName ? ` · ${escapeHtml(s.t('expenseAddedBy', a.addedByName))}` : ''}</div></div><div>${a.original ? `<span class="muted">${escapeHtml(formatAmount(a.original.amount, a.original.currencyCode))} → </span>` : ''}${a.original?.manualRate ? `<span class="tag">${escapeHtml(s.t('manualRateTag'))}</span> ` : ''}${escapeHtml(formatAmount(a.amount, m.currencyCode))}<div>${del}</div></div></div>`;
      }
      const undo =
        allowActions && a.canVoid && !a.voided && m.me
          ? `<form class="inline" method="post" action="${escapeHtml(actionUrl(m, `/settlements/${encodeURIComponent(a.id)}/void`))}">${csrfField(m)}<button class="btn btn-secondary btn-small" type="submit">${escapeHtml(s.t('undoButton'))}</button></form>`
          : '';
      const tag = a.voided ? `<span class="tag">${escapeHtml(s.t('voidedTag'))}</span>` : '';
      return `<div class="row"><div class="${a.voided ? 'struck' : ''}">${escapeHtml(s.t('settlementLine', a.fromName, a.toName))}${tag}</div><div>${escapeHtml(formatAmount(a.amount, m.currencyCode))}<div>${undo}</div></div></div>`;
    })
    .join('');
}

function renderTransfers(m: GroupPageModel, s: GroupGuestStrings): string {
  if (m.transfers.length === 0) return `<p class="muted">${escapeHtml(s.t('nothingToSettle'))}</p>`;
  return m.transfers
    .map((t, i) => {
      // ABA-652: the amount is editable (prefilled with the suggested transfer); the server re-checks
      // it against the current balances, so this field is never trusted.
      const settleForm =
        m.me && !m.archived && t.canSettle
          ? `<form method="post" action="${escapeHtml(actionUrl(m, '/settle'))}">${csrfField(m)}<input type="hidden" name="fromMemberId" value="${escapeHtml(t.fromId)}"><input type="hidden" name="toMemberId" value="${escapeHtml(t.toId)}"><label for="sa-${i}">${escapeHtml(s.t('settleAmountLabel', m.currencyCode))}</label><input id="sa-${i}" type="text" name="amount" value="${escapeHtml(t.amount.toFixed(2))}" inputmode="decimal" maxlength="10" autocomplete="off" required><p class="muted">${escapeHtml(s.t('settlePartialHint', formatAmount(t.maxAmount, m.currencyCode)))}</p><input type="hidden" name="v" value="${m.ledgerVersion}"><input type="hidden" name="rid" value="${escapeHtml(m.rid)}-${escapeHtml(t.fromId.slice(0, 8))}${escapeHtml(t.toId.slice(0, 8))}"><button class="btn btn-secondary" type="submit">${escapeHtml(s.t(t.iAmReceiver ? 'markReceived' : 'markPaid'))}</button></form>`
          : '';
      let pay = '';
      if (t.pay) {
        const label = methodName(s, t.pay.method);
        pay = t.pay.link
          ? `<a class="btn btn-secondary" rel="noreferrer" href="${escapeHtml(t.pay.link)}">${escapeHtml(s.t('payWith', label))}</a><div class="muted">${escapeHtml(t.pay.handle)}</div>`
          : `<div class="muted">${escapeHtml(label)}: ${escapeHtml(t.pay.handle)}</div>`;
      }
      return `<div class="row" style="display:block"><div style="display:flex;justify-content:space-between"><span>${escapeHtml(s.t('transferLine', t.fromName, t.toName))}</span><strong>${escapeHtml(formatAmount(t.amount, m.currencyCode))}</strong></div>${pay}${settleForm}</div>`;
    })
    .join('');
}

function renderBalances(m: GroupPageModel, s: GroupGuestStrings): string {
  return m.members
    .map((b) => {
      const abs = Math.abs(b.balance);
      let text: string;
      let cls = '';
      if (abs < 0.005) text = s.t('balanceEven');
      else if (b.balance > 0) {
        text = s.t('balanceOwed', formatAmount(abs, m.currencyCode));
        cls = 'pos';
      } else {
        text = s.t('balanceOwes', formatAmount(abs, m.currencyCode));
        cls = 'neg';
      }
      return `<div class="row"><span>${escapeHtml(b.name)}</span><span class="${cls}">${escapeHtml(text)}</span></div>`;
    })
    .join('');
}

function renderPicker(m: GroupPageModel, s: GroupGuestStrings): string {
  const names = m.claimable
    .map(
      (c) =>
        `<form method="post" action="${escapeHtml(actionUrl(m, '/join'))}"><input type="hidden" name="memberId" value="${escapeHtml(c.id)}"><button class="btn btn-secondary" type="submit">${escapeHtml(c.name)}</button></form>`,
    )
    .join('');
  return `<div class="card"><h2>${escapeHtml(s.t('whoTitle'))}</h2><p class="muted">${escapeHtml(s.t('whoHint'))}</p>${names}<details><summary>${escapeHtml(s.t('notOnList'))}</summary><form method="post" action="${escapeHtml(actionUrl(m, '/join'))}"><label for="n">${escapeHtml(s.t('nameLabel'))}</label><input id="n" type="text" name="name" maxlength="40" required><button class="btn btn-main" type="submit">${escapeHtml(s.t('joinButton'))}</button></form></details><details><summary>${escapeHtml(s.t('restoreFormTitle'))}</summary><form method="post" action="${escapeHtml(actionUrl(m, '/restore'))}"><label for="rc">${escapeHtml(s.t('restoreCodeLabel'))}</label><input id="rc" type="text" name="code" maxlength="32" minlength="32" pattern="[a-f0-9]{32}" autocomplete="off" required><button class="btn btn-secondary" type="submit">${escapeHtml(s.t('restoreButton'))}</button></form></details></div>`;
}

function renderExpenseForm(m: GroupPageModel, s: GroupGuestStrings): string {
  const memberRows = m.members
    .map(
      (mem) =>
        `<div class="pick"><input type="checkbox" name="inc_${escapeHtml(mem.id)}" value="1" checked><span>${escapeHtml(mem.name)}</span><input type="number" name="amt_${escapeHtml(mem.id)}" step="0.01" min="0" inputmode="decimal"></div>`,
    )
    .join('');
  const payers = m.members
    .map((mem) => `<option value="${escapeHtml(mem.id)}"${mem.id === m.me?.id ? ' selected' : ''}>${escapeHtml(mem.name)}</option>`)
    .join('');
  // ABA-654: no script, so no live preview; the server converts and the history shows both figures.
  const currencies = (m.entryCurrencies.length ? m.entryCurrencies : [m.currencyCode])
    .map((c) => `<option value="${escapeHtml(c)}"${c === m.currencyCode ? ' selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');
  return `<div class="card"><h2>${escapeHtml(s.t('addHeading'))}</h2><form method="post" action="${escapeHtml(actionUrl(m, '/expenses'))}">${csrfField(m)}<input type="hidden" name="rid" value="${escapeHtml(m.rid)}"><label for="d">${escapeHtml(s.t('descLabel'))}</label><input id="d" type="text" name="description" maxlength="120" required><label for="a">${escapeHtml(s.t('amountPlainLabel'))}</label><input id="a" type="number" name="amount" step="0.01" min="0.01" inputmode="decimal" required><label for="cur">${escapeHtml(s.t('currencyLabel'))}</label><select id="cur" name="currency">${currencies}</select><p class="muted">${escapeHtml(s.t('fxHint', m.currencyCode))}</p><label for="dt">${escapeHtml(s.t('dateLabel'))}</label><input id="dt" type="date" name="date" value="${escapeHtml(m.today)}"><label for="p">${escapeHtml(s.t('paidByLabel'))}</label><select id="p" name="paidBy">${payers}</select><label for="st">${escapeHtml(s.t('splitLabel'))}</label><select id="st" name="splitType"><option value="equal">${escapeHtml(s.t('splitEqual'))}</option><option value="exact">${escapeHtml(s.t('splitExact'))}</option></select><p class="muted">${escapeHtml(s.t('splitHint'))}</p>${memberRows}<button class="btn btn-main" type="submit">${escapeHtml(s.t('addButton'))}</button></form>${ctaCard(s, 'form')}</div>`;
}

/**
 * ABA-655: one `<details>` per open itemised receipt, no script. Every rendered line carries a hidden
 * `l_<id>` so the server can tell an unticked box (no `c_<id>`) from a line that was not on the page.
 * A hand-split line (the payer set explicit shares) is shown read-only and carries neither key, so a
 * guest submit can never touch it. Every item name goes through `escapeHtml`.
 */
function renderClaimReceipts(m: GroupPageModel, s: GroupGuestStrings): string {
  if (!m.me || m.archived || m.receipts.length === 0) return '';
  const blocks = m.receipts
    .map((r) => {
      const rows = r.lines
        .map((l) => {
          const label = `${escapeHtml(l.name)} <span class="muted">${escapeHtml(formatAmount(l.price, r.itemCurrency))}${
            l.claimants > 1 ? ` · ${escapeHtml(s.t('claimsSharedWith', l.claimants))}` : ''
          }${l.mine ? ` · ${escapeHtml(s.t('claimsYourPart', formatAmount(l.myPart, r.itemCurrency)))}` : ''}</span>`;
          if (l.handSplit) {
            return `<div class="pick"><span>${label} <span class="tag">${escapeHtml(s.t('claimsHandSplit', r.payerName))}</span></span></div>`;
          }
          const id = escapeHtml(l.id);
          return `<div class="pick"><input type="hidden" name="l_${id}" value="1"><input type="checkbox" id="c-${id}" name="c_${id}" value="1"${l.mine ? ' checked' : ''}><label for="c-${id}" style="margin:0;color:inherit;font-size:14px;flex:1">${label}</label></div>`;
        })
        .join('');
      const summary = s.t('claimsSummary', r.description, formatAmount(r.amount, m.currencyCode), r.openUntil);
      return `<details><summary>${escapeHtml(summary)}</summary><form method="post" action="${escapeHtml(actionUrl(m, `/expenses/${encodeURIComponent(r.id)}/claims`))}">${csrfField(m)}<p class="muted">${escapeHtml(s.t('claimsHint', r.payerName))}</p>${rows}<p class="muted">${escapeHtml(s.t('claimsYourTotal', formatAmount(r.myTotal, r.itemCurrency)))}</p><button class="btn btn-main" type="submit">${escapeHtml(s.t('claimsSaveButton'))}</button></form></details>`;
    })
    .join('');
  return `<div class="card"><h2>${escapeHtml(s.t('claimsHeading'))}</h2>${blocks}</div>`;
}

function renderPaymentForm(m: GroupPageModel, s: GroupGuestStrings): string {
  const cur = m.me?.paymentMethod ?? '';
  const opt = (value: string, label: string) =>
    `<option value="${escapeHtml(value)}"${cur === value ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  return `<div class="card"><h2>${escapeHtml(s.t('paymentHeading'))}</h2><p class="muted">${escapeHtml(s.t('paymentHint'))}</p><form method="post" action="${escapeHtml(actionUrl(m, '/payment-info'))}">${csrfField(m)}<label for="pm">${escapeHtml(s.t('methodLabel'))}</label><select id="pm" name="paymentMethod">${opt('', s.t('methodNone'))}${opt('blik', 'BLIK')}${opt('revolut', 'Revolut')}${opt('paypal', 'PayPal')}${opt('cash', s.t('methodCash'))}${opt('other', s.t('methodOther'))}</select><label for="ph">${escapeHtml(s.t('handleLabel'))}</label><input id="ph" type="text" name="paymentHandle" maxlength="64" value="${escapeHtml(m.me?.paymentHandle ?? '')}"><button class="btn btn-main" type="submit">${escapeHtml(s.t('saveButton'))}</button></form></div>`;
}

function renderLinkCard(m: GroupPageModel, s: GroupGuestStrings): string {
  const form = (target: 'web' | 'app', key: GroupStrKey) =>
    `<form method="post" action="${escapeHtml(actionUrl(m, '/link'))}">${csrfField(m)}<input type="hidden" name="target" value="${target}"><button class="btn btn-secondary" type="submit">${escapeHtml(s.t(key))}</button></form>`;
  return `<div class="card"><h2>${escapeHtml(s.t('linkHeading'))}</h2><p class="muted">${escapeHtml(s.t('linkHint'))}</p>${form('web', 'linkWeb')}${m.showAndroidAppButton ? form('app', 'linkApp') : ''}</div>`;
}

export function renderGroupPage(m: GroupPageModel, s: GroupGuestStrings, cta: CtaMoment | null): string {
  const title = `${m.emoji ? `${m.emoji} ` : ''}${m.groupName}`;
  const flashKey = m.flash ? FLASH_KEYS[m.flash] : undefined;
  // The group currency fills the `{0}` of the FX flashes (ABA-654); the others have no placeholder.
  const flash = flashKey ? `<div class="flash">${escapeHtml(s.t(flashKey, m.currencyCode))}</div>` : '';
  const archived = m.archived ? `<div class="flash">${escapeHtml(s.t('archivedNote'))}</div>` : '';

  const header = `<div class="card"><h1>${escapeHtml(title)}</h1>${
    m.me
      ? `<p class="muted">${escapeHtml(s.t('youAre', m.me.name))}</p><form method="post" action="${escapeHtml(actionUrl(m, '/forget'))}">${csrfField(m)}<button class="btn btn-secondary btn-small" type="submit">${escapeHtml(s.t('notMe'))}</button></form>`
      : ''
  }</div>`;

  const restore =
    m.me?.restoreCode
      ? `<div class="card"><details><summary>${escapeHtml(s.t('restoreSummary'))}</summary><p class="muted">${escapeHtml(s.t('restoreHint', m.me.name))}</p><div class="code">${escapeHtml(m.me.restoreCode)}</div></details></div>`
      : '';

  const picker = !m.me && !m.archived ? renderPicker(m, s) : '';
  const ctaAfter = m.me && cta && cta !== 'form' ? ctaCard(s, cta) : '';
  const writeBlocks = m.me && !m.archived ? `${renderExpenseForm(m, s)}${renderPaymentForm(m, s)}${renderLinkCard(m, s)}` : '';

  const body = [
    flash,
    archived,
    header,
    restore,
    picker,
    ctaAfter,
    `<div class="card"><h2>${escapeHtml(s.t('balancesHeading'))}</h2>${renderBalances(m, s)}</div>`,
    `<div class="card"><h2>${escapeHtml(s.t('transfersHeading'))}</h2>${
      m.claimsOpen ? `<p class="muted">${escapeHtml(s.t('settleClaimsOpenNote'))}</p>` : ''
    }${renderTransfers(m, s)}</div>`,
    renderClaimReceipts(m, s),
    writeBlocks,
    `<div class="card"><h2>${escapeHtml(s.t('historyHeading'))}</h2>${activityRows(m, s, !m.archived)}${
      m.nextBefore
        ? `<a class="btn btn-secondary" href="${escapeHtml(`/g/${encodeURIComponent(m.token)}/activity?before=${encodeURIComponent(m.nextBefore)}&lang=${encodeURIComponent(m.lang)}`)}">${escapeHtml(s.t('olderHistory'))}</a>`
        : ''
    }</div>`,
  ].join('');
  return pageShell(s.lang, title, body);
}

/** An older page of history (read-only: no forms). */
export function renderGroupActivityPage(m: GroupPageModel, s: GroupGuestStrings): string {
  const title = `${m.emoji ? `${m.emoji} ` : ''}${m.groupName}`;
  const body = `<div class="card"><h1>${escapeHtml(title)}</h1><h2>${escapeHtml(s.t('historyHeading'))}</h2>${activityRows(m, s, false)}${
    m.nextBefore
      ? `<a class="btn btn-secondary" href="${escapeHtml(`/g/${encodeURIComponent(m.token)}/activity?before=${encodeURIComponent(m.nextBefore)}&lang=${encodeURIComponent(m.lang)}`)}">${escapeHtml(s.t('olderHistory'))}</a>`
      : ''
  }<a class="btn btn-secondary" href="${escapeHtml(`/g/${encodeURIComponent(m.token)}?lang=${encodeURIComponent(m.lang)}`)}">${escapeHtml(s.t('backToGroup'))}</a></div>`;
  return pageShell(s.lang, title, body);
}

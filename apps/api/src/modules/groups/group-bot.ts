import { createHash } from 'crypto';
import { SUPPORTED_RATE_CURRENCIES } from '../currency-exchange/exchange-rate.service';
import { GROUP_AMOUNT_MAX, GROUP_AMOUNT_MIN } from './group-fx';

/**
 * Pure helpers for adding a group expense from a bot (ABA-658, phase-2 spec item I). No DI.
 *
 * The command is `group <amount> [currency] [description]` (Telegram `/group`) on all three bots,
 * with no AI call. Everything the bots cannot express (another payer, a custom split) stays in the app.
 */

/** The picker shows at most this many groups (WhatsApp's interactive list caps at 10 rows). */
export const BOT_GROUP_PICKER_MAX = 10;
/** A draft lives this long between the command and Confirm (spec: 1800 s). */
export const BOT_GROUP_DRAFT_TTL_SEC = 1800;
/** The description column is 1..120 characters (CreateGroupExpenseDto). */
export const BOT_GROUP_DESCRIPTION_MAX = 120;

const SYMBOLS: Record<string, string> = {
  '₴': 'UAH',
  $: 'USD',
  '€': 'EUR',
  zł: 'PLN',
  '£': 'GBP',
  '₽': 'RUB',
  Br: 'BYN',
};
const SYMBOL_RE = '(?:₴|\\$|€|zł|£|₽|Br)';
const COMMAND_RE = new RegExp(
  `^(${SYMBOL_RE})?\\s*(\\d+(?:[.,]\\d+)?)\\s*(${SYMBOL_RE}(?![A-Za-z]))?\\s*(.*)$`,
  's',
);

export interface ParsedGroupCommand {
  amount: number;
  /** Null = the group's own currency, decided once the group is known. */
  currencyCode: string | null;
  description: string;
}

/**
 * Parses `<amount> [currency] [description]`. A currency is a symbol (`€25`, `25€`), a supported ISO
 * code in any case (`25 eur`), or ANY three upper-case letters (`25 CHF`), so an unsupported code is
 * refused with a clear message instead of silently becoming part of the description. A lower-case
 * three-letter word that is not a supported code (`25 tea`) stays in the description.
 * Returns null when there is no valid amount (0.01 .. 1 000 000, at most 2 decimals).
 */
export function parseGroupCommand(args: string): ParsedGroupCommand | null {
  const m = COMMAND_RE.exec(args.trim());
  if (!m) return null;
  const [, before, rawAmount, after] = m;
  let rest = (m[4] ?? '').trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(rawAmount)) return null;
  const amount = Number(rawAmount.replace(',', '.'));
  if (!Number.isFinite(amount) || amount < GROUP_AMOUNT_MIN || amount > GROUP_AMOUNT_MAX) return null;

  let currencyCode: string | null = before ? SYMBOLS[before] : after ? SYMBOLS[after] : null;
  if (!currencyCode) {
    const code = /^([A-Za-z]{3})(?=\s|$)/.exec(rest);
    if (code) {
      const upper = code[1].toUpperCase();
      const supported = (SUPPORTED_RATE_CURRENCIES as readonly string[]).includes(upper);
      if (supported || code[1] === upper) {
        currencyCode = upper;
        rest = rest.slice(3).trim();
      }
    }
  }
  return { amount, currencyCode, description: truncateCodePoints(rest, BOT_GROUP_DESCRIPTION_MAX).trim() };
}

/** Cuts by code point, never splitting a surrogate pair (an emoji at the boundary stays whole or goes). */
export function truncateCodePoints(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length <= max ? s : cps.slice(0, max).join('');
}

/** The prefix of every bot-derived request id. The app DTO rejects it (`BOT_REQUEST_ID_PREFIX`). */
export const BOT_REQUEST_ID_PREFIX = 'bot:';

/**
 * The expense's `clientRequestId`, derived from the platform's own message id, so a retried
 * delivery of the same command and a double-tapped Confirm both land on the existing
 * `createExpense` dedup (`{groupId, clientRequestId}`) and create one expense.
 *
 * Salted with the user AND the group (one message id can never address two groups or two users) and
 * namespaced with `bot:`, which the app's `CreateGroupExpenseDto.clientRequestId` refuses, so a client
 * can never pre-register a key a bot will later derive. `namespace` is the platform draft prefix.
 */
export function botClientRequestId(namespace: string, messageKey: string, userId: string, groupId: string): string {
  const digest = createHash('sha256').update(JSON.stringify([namespace, messageKey, userId, groupId])).digest('hex');
  return `${BOT_REQUEST_ID_PREFIX}${digest.slice(0, 40)}`;
}

/** "120.00 PLN" — the money format every bot already uses. */
export function formatBotMoney(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

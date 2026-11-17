/**
 * Which of the user's accounts a bot message is about (Telegram, WhatsApp and
 * Slack share this). The bot writes to its own linked account — not the one
 * open in the app, which only the device knows — unless the message names
 * another account as a whole word.
 */
export interface AccountInfo {
  id: string;
  name: string;
  currencyCode: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether `name` occurs in `message` as a whole word (or phrase), case-insensitively.
 * A substring match is not enough: an account called "Дом" must not take over
 * "купил домой хлеб", and "Car" must not take over "carrots".
 */
export function mentionsAccountName(message: string, name: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(n)}($|[^\\p{L}\\p{N}])`, 'iu');
  return re.test(message);
}

/**
 * The account a single message is about. Does NOT switch the bot's linked
 * account; `wasOverridden` says the message named an account other than it.
 */
export function resolveAccountFromMessage(
  message: string,
  accounts: AccountInfo[],
  currentAccountId: string,
): { resolvedAccountId: string; resolvedAccountName: string | null; wasOverridden: boolean } {
  if (accounts.length <= 1) {
    return { resolvedAccountId: currentAccountId, resolvedAccountName: null, wasOverridden: false };
  }
  const matches = accounts.filter((a) => mentionsAccountName(message, a.name));
  if (matches.length === 0) {
    return { resolvedAccountId: currentAccountId, resolvedAccountName: null, wasOverridden: false };
  }
  // Several matches — the longest name is the most specific one.
  const best = [...matches].sort((a, b) => b.name.length - a.name.length)[0];
  return {
    resolvedAccountId: best.id,
    resolvedAccountName: best.name,
    wasOverridden: best.id !== currentAccountId,
  };
}

/**
 * The `💼 Account: …` line a bot adds under every write it proposes or saves,
 * so the user sees where it goes before confirming. Empty for a user with one
 * account — there is nothing to choose. `t` is the calling bot's own
 * translator, which supplies its `{{accountCmd}}`.
 */
export function accountFooter(
  t: (key: string, lang?: string, params?: Record<string, string>) => string,
  lang: string | undefined,
  account: { name: string; multiAccount: boolean; fromMessage?: boolean },
  /** Telegram passes `escapeHtml`: its messages are HTML and a name is user text. */
  escape: (s: string) => string = (s) => s,
): string {
  if (!account.multiAccount || !account.name) return '';
  const key = account.fromMessage ? 'accountFooterFromMessage' : 'accountFooter';
  return '\n\n' + t(key, lang, { name: escape(account.name) });
}

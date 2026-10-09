const COMMANDS = [
  'expense',
  'income',
  'help',
  'unlink',
  'account',
  'menu',
  'newchat',
  'usage',
  'category',
  'categories',
  'categorize',
  'link',
  'digest',
];

const NUMBER_RE = /^\d+([.,]\d+)?/;

/** `digest` is a command ONLY as the whole message — "digest my receipts" is chat. */
const DIGEST_RE = /^digest\s+(on|off|now)$/i;

/**
 * `group` (ABA-658) is a command only when an amount follows (or alone, for the usage line):
 * "group my expenses by category" is chat.
 */
const GROUP_RE = /^group(?:\s+((?:₴|\$|€|zł|£|₽|Br)?\s*\d[\s\S]*))?$/i;

export interface ParsedCommand {
  command: string;
  args: string;
}

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const stripped = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const firstWord = stripped.split(/\s+/)[0];
  const lowerFirst = firstWord.toLowerCase();

  if (lowerFirst === 'group') {
    const match = GROUP_RE.exec(stripped);
    return match ? { command: 'group', args: (match[1] ?? '').trim() } : null;
  }

  if (lowerFirst === 'digest') {
    const match = DIGEST_RE.exec(stripped);
    return match ? { command: 'digest', args: match[1].toLowerCase() } : null;
  }

  if (COMMANDS.includes(lowerFirst)) {
    return {
      command: lowerFirst,
      args: stripped.slice(firstWord.length).trim(),
    };
  }

  if (NUMBER_RE.test(firstWord)) {
    return { command: 'expense', args: stripped };
  }

  return null;
}

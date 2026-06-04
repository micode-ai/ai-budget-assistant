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
  'link',
];

const NUMBER_RE = /^\d+([.,]\d+)?/;

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

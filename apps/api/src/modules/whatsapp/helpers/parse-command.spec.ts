import { parseCommand } from './parse-command';

describe('parseCommand', () => {
  it('recognizes commands with leading slash', () => {
    expect(parseCommand('/help')).toEqual({ command: 'help', args: '' });
    expect(parseCommand('/expense 50 lunch')).toEqual({ command: 'expense', args: '50 lunch' });
  });

  it('recognizes commands without leading slash', () => {
    expect(parseCommand('help')).toEqual({ command: 'help', args: '' });
    expect(parseCommand('expense 50 lunch')).toEqual({ command: 'expense', args: '50 lunch' });
  });

  it('treats leading number as implicit expense', () => {
    expect(parseCommand('50 lunch')).toEqual({ command: 'expense', args: '50 lunch' });
    expect(parseCommand('12.5 coffee')).toEqual({ command: 'expense', args: '12.5 coffee' });
  });

  it('case-insensitive command keyword', () => {
    expect(parseCommand('HELP')).toEqual({ command: 'help', args: '' });
    expect(parseCommand('/Income 3000')).toEqual({ command: 'income', args: '3000' });
  });

  it('returns null for non-command free text', () => {
    expect(parseCommand('how much did I spend on food?')).toBeNull();
    expect(parseCommand('hello bot')).toBeNull();
  });

  it('recognizes link command (case-insensitive code)', () => {
    expect(parseCommand('link A3K9F2')).toEqual({ command: 'link', args: 'A3K9F2' });
    expect(parseCommand('LINK abc123')).toEqual({ command: 'link', args: 'abc123' });
  });

  it('trims whitespace', () => {
    expect(parseCommand('  /help  ')).toEqual({ command: 'help', args: '' });
  });

  describe('digest', () => {
    it.each(['digest on', 'digest off', 'digest now', '  DIGEST Now  ', 'Digest   OFF', '/digest now'])(
      'treats %p as the digest command',
      (text) => {
        const parsed = parseCommand(text);
        expect(parsed?.command).toBe('digest');
        expect(['on', 'off', 'now']).toContain(parsed?.args.toLowerCase());
      },
    );

    it.each(['digest my receipts', 'digest', 'digest now please', 'digest on off', 'Digest everything from last week'])(
      'sends %p to normal chat',
      (text) => {
        expect(parseCommand(text)).toBeNull();
      },
    );
  });
});

describe('parseCommand — group (ABA-658)', () => {
  it('is a command when an amount follows, with or without a slash or a symbol', () => {
    expect(parseCommand('group 120 pizza')).toEqual({ command: 'group', args: '120 pizza' });
    expect(parseCommand('/Group 25 EUR taxi')).toEqual({ command: 'group', args: '25 EUR taxi' });
    expect(parseCommand('group €25 taxi')).toEqual({ command: 'group', args: '€25 taxi' });
  });

  it('alone is a command (the usage line)', () => {
    expect(parseCommand('group')).toEqual({ command: 'group', args: '' });
  });

  it('followed by words is chat', () => {
    expect(parseCommand('group my expenses by category')).toBeNull();
  });
});

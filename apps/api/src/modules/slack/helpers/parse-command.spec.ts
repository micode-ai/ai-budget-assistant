import { parseCommand } from './parse-command';

describe('parseCommand (slack)', () => {
  it('parses a known command with args', () => {
    expect(parseCommand('expense 12 coffee')).toEqual({ command: 'expense', args: '12 coffee' });
  });
  it('parses link code', () => {
    expect(parseCommand('link ABC123')).toEqual({ command: 'link', args: 'ABC123' });
  });
  it('treats a leading number as an expense', () => {
    expect(parseCommand('15.50 lunch')).toEqual({ command: 'expense', args: '15.50 lunch' });
  });
  it('strips a leading slash', () => {
    expect(parseCommand('/help')).toEqual({ command: 'help', args: '' });
  });
  it('returns null for free-form text', () => {
    expect(parseCommand('how much did I spend?')).toBeNull();
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

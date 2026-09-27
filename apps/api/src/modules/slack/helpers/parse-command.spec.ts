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

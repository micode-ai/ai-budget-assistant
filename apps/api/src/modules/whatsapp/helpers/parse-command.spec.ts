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
});

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
});

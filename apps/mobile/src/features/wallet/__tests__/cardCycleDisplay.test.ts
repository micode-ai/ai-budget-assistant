import { utilisationBar, dayOfMonth, parseDay } from '../cardCycleDisplay';

describe('utilisationBar', () => {
  it('is null without a limit', () => {
    expect(utilisationBar(null)).toBeNull();
  });
  it('fills proportionally under the limit', () => {
    expect(utilisationBar(0.25)).toEqual({ fill: 0.25, over: false, percent: 25 });
  });
  it('is not over at exactly 100%', () => {
    expect(utilisationBar(1)).toEqual({ fill: 1, over: false, percent: 100 });
  });
  it('clamps the fill but keeps the real percent when over', () => {
    expect(utilisationBar(1.4)).toEqual({ fill: 1, over: true, percent: 140 });
  });
  it('treats negatives as zero', () => {
    expect(utilisationBar(-0.2)?.fill).toBe(0);
  });
});

describe('dayOfMonth', () => {
  it('reads the day without a Date', () => {
    expect(dayOfMonth('2026-12-05')).toBe(5);
    expect(dayOfMonth('2026-01-31')).toBe(31);
  });
  it('returns null for junk', () => {
    expect(dayOfMonth('soon')).toBeNull();
  });
});

describe('parseDay', () => {
  it('accepts 1..31', () => {
    expect(parseDay('1')).toBe(1);
    expect(parseDay(' 31 ')).toBe(31);
  });
  it('rejects out of range and non-integers', () => {
    expect(parseDay('0')).toBeNull();
    expect(parseDay('32')).toBeNull();
    expect(parseDay('1.5')).toBeNull();
    expect(parseDay('')).toBeNull();
  });
});

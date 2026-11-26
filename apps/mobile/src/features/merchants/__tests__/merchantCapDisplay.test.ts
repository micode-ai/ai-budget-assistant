import { capBar } from '../merchantCapDisplay';

describe('capBar', () => {
  it('clamps the fill but not the label', () => {
    expect(capBar(120)).toEqual({ fill: 1, over: true, warn: false, percent: 120 });
  });
  it('flags the warning band', () => {
    expect(capBar(85).warn).toBe(true);
    expect(capBar(79).warn).toBe(false);
  });
  it('survives junk', () => {
    expect(capBar(NaN).percent).toBe(0);
    expect(capBar(-5).fill).toBe(0);
  });
});

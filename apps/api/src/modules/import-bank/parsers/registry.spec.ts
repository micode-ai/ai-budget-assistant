import { PARSERS, getParserById, detectParser } from './registry';

describe('parser registry', () => {
  it('has all 6 parsers in detection order', () => {
    expect(PARSERS.map((p) => p.id)).toEqual([
      'mbank', 'pko', 'ing', 'millennium', 'pekao', 'universal',
    ]);
  });

  it('getParserById returns matching parser', () => {
    expect(getParserById('mbank')?.displayName).toBe('mBank');
    expect(getParserById('universal')?.id).toBe('universal');
    expect(getParserById('unknown' as any)).toBeUndefined();
  });

  it('detectParser returns the first bank parser whose detect() is true', () => {
    expect(detectParser(['#Data operacji', '#Kwota'])?.id).toBe('mbank');
    expect(detectParser(['Data', 'Obciążenia', 'Uznania'])?.id).toBe('pko');
    expect(detectParser(['Random', 'Headers'])).toBeUndefined();
  });

  it('never auto-detects universal', () => {
    expect(detectParser(['anything'])?.id).not.toBe('universal');
  });
});

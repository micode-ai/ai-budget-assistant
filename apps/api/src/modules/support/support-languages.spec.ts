import { supportTargetLanguage } from './support-languages';

describe('supportTargetLanguage', () => {
  it('maps br to Brazilian Portuguese', () => {
    expect(supportTargetLanguage('br')).toEqual({ iso: 'pt', name: 'Brazilian Portuguese' });
  });
  it('maps ua to Ukrainian (uk)', () => {
    expect(supportTargetLanguage('ua')).toEqual({ iso: 'uk', name: 'Ukrainian' });
  });
  it('maps pt to European Portuguese', () => {
    expect(supportTargetLanguage('pt')).toEqual({ iso: 'pt', name: 'European Portuguese' });
  });
  it('maps be to Belarusian', () => {
    expect(supportTargetLanguage('be')).toEqual({ iso: 'be', name: 'Belarusian' });
  });
  it('falls back to en for unknown', () => {
    expect(supportTargetLanguage('xx').iso).toBe('en');
  });
});

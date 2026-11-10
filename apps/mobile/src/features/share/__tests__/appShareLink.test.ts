import { buildTaggedPlayUrl, buildTaggedWebUrl, isValidTag, toLangTag } from '../appShareLink';

describe('appShareLink', () => {
  const tags = { src: 'share', loc: 'settings', lang: 'pl' };

  it('builds the Play link with a fully URL-encoded referrer', () => {
    const url = buildTaggedPlayUrl(tags);
    expect(url).toBe(
      'https://play.google.com/store/apps/details?id=com.budget.assistant&referrer=' +
        'src%3Dshare%26loc%3Dsettings%26lang%3Dpl%26utm_source%3Dshare%26utm_medium%3Dsettings',
    );
    const referrer = new URL(url).searchParams.get('referrer');
    expect(referrer).toBe('src=share&loc=settings&lang=pl&utm_source=share&utm_medium=settings');
  });

  it('builds the web link with plain query params', () => {
    expect(buildTaggedWebUrl(tags)).toBe('https://app.ai-budget.pl/?src=share&loc=settings&lang=pl');
  });

  it('accepts a hyphen and exactly 20 characters', () => {
    expect(isValidTag('share-image')).toBe(true);
    expect(isValidTag('a'.repeat(20))).toBe(true);
  });

  it('rejects empty, over-long, uppercase and special-character tags', () => {
    expect(isValidTag('')).toBe(false);
    expect(isValidTag('a'.repeat(21))).toBe(false);
    expect(isValidTag('Share')).toBe(false);
    expect(isValidTag('a&b')).toBe(false);
    expect(isValidTag('a b')).toBe(false);
    expect(() => buildTaggedPlayUrl({ ...tags, loc: 'x&utm_source=evil' })).toThrow();
    expect(() => buildTaggedWebUrl({ ...tags, src: 'a'.repeat(21) })).toThrow();
  });

  it('normalises a locale into a valid lang tag', () => {
    expect(toLangTag('pt-BR')).toBe('pt-br');
    expect(toLangTag('ua')).toBe('ua');
    expect(toLangTag('')).toBe('xx');
    expect(toLangTag(undefined)).toBe('xx');
    expect(isValidTag(toLangTag('en_US!!'))).toBe(true);
  });
});

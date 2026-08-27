import { parseAcquisition, ACQUISITION_KEYS } from '../attribution.types';

describe('parseAcquisition', () => {
  it('reads the four CTA params the marketing generators emit', () => {
    expect(parseAcquisition('?src=landing&loc=pricing_card&lang=uk&plan=pro')).toEqual({
      src: 'landing',
      loc: 'pricing_card',
      lang: 'uk',
      plan: 'pro',
    });
  });

  it('keeps a partial set — most CTAs carry no plan', () => {
    expect(parseAcquisition('?src=blog&loc=cta&lang=en')).toEqual({
      src: 'blog',
      loc: 'cta',
      lang: 'en',
    });
  });

  it('returns undefined when nothing usable is present, so the field can be omitted', () => {
    expect(parseAcquisition('')).toBeUndefined();
    expect(parseAcquisition('?utm_source=newsletter')).toBeUndefined();
  });

  it('ignores unrelated params instead of forwarding them', () => {
    expect(parseAcquisition('?src=help&ref=abc&gclid=xyz')).toEqual({ src: 'help' });
  });

  // The charset guard is the thing standing between a URL anyone can craft and a column
  // the admin groups by. A bad value is DROPPED, never sent: attribution must not be able
  // to make the API reject a registration.
  it.each([
    ['a value with a space', '?src=land%20ing'],
    ['punctuation', '?src=landing%3Bdrop'],
    ['over 20 characters', `?src=${'a'.repeat(21)}`],
    ['empty', '?src='],
  ])('drops %s', (_label, search) => {
    expect(parseAcquisition(search)).toBeUndefined();
  });

  it('drops only the bad field and keeps the good ones', () => {
    expect(parseAcquisition('?src=landing&loc=a b c&lang=en')).toEqual({ src: 'landing', lang: 'en' });
  });

  it('exposes exactly the keys the API accepts', () => {
    expect([...ACQUISITION_KEYS]).toEqual(['src', 'loc', 'lang', 'plan']);
  });
});

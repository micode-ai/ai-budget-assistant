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
    expect(parseAcquisition('?gclid=xyz')).toBeUndefined();
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

// Directories, newsletters and ad networks tag with the standard utm_* scheme.
// Reading only our own `?src=` filed every one of them under "direct/unknown" —
// exactly the traffic worth telling apart.
describe('parseAcquisition — utm_* fallback', () => {
  it('reads a directory referral our own scheme never tagged', () => {
    expect(parseAcquisition('?utm_source=startupfa.me&utm_medium=referral')).toEqual({
      src: 'startupfa-me',
      loc: 'referral',
    });
  });

  it('folds a hostname into the charset the API accepts', () => {
    // A dot fails the charset guard, so without normalisation the guard meant to
    // stop hostile input would silently drop every directory referral instead.
    expect(parseAcquisition('?utm_source=news.ycombinator.com')).toEqual({
      src: 'news-ycombinator-com',
    });
  });

  it('truncates rather than drops an over-long source', () => {
    // 20 chars is the API limit; a cut label still beats no label.
    expect(parseAcquisition('?utm_source=newsletter_september_2026')).toEqual({
      src: 'newsletter_september',
    });
  });

  it('never leaves a dangling dash from the cut', () => {
    expect(parseAcquisition(`?utm_source=${'a'.repeat(19)}.b`)).toEqual({
      src: 'a'.repeat(19),
    });
  });

  it('requires a source — medium alone says how, not from where', () => {
    expect(parseAcquisition('?utm_medium=referral&utm_campaign=verified')).toBeUndefined();
  });

  it('lets our own tags win outright, never mixing the two schemes', () => {
    expect(
      parseAcquisition('?src=landing&loc=hero&utm_source=startupfa.me&utm_medium=referral'),
    ).toEqual({ src: 'landing', loc: 'hero' });
  });

  it('ignores the utm set even when our own tags are only partial', () => {
    // `src=blog` with someone else's medium in `loc` would be an incoherent record.
    expect(parseAcquisition('?src=blog&utm_medium=cpc')).toEqual({ src: 'blog' });
  });

  it('drops a source that normalises to nothing', () => {
    expect(parseAcquisition('?utm_source=...')).toBeUndefined();
  });
});

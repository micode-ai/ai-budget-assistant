import { resolvePushed, resolveStored, truncateReferrer } from '../acquisitionStore';

describe('resolveStored', () => {
  it('returns undefined when nothing was ever stored', () => {
    expect(resolveStored(() => undefined)).toBeUndefined();
  });

  it('re-validates on read, dropping a hand-edited value', () => {
    expect(resolveStored(() => JSON.stringify({ src: 'has space' }))).toBeUndefined();
  });

  it('keeps a valid record', () => {
    expect(resolveStored(() => JSON.stringify({ src: 'blog', lang: 'pl' }))).toEqual({
      src: 'blog',
      lang: 'pl',
    });
  });

  it('survives corrupt JSON rather than throwing into the entry point', () => {
    expect(resolveStored(() => '{not json')).toBeUndefined();
  });
});

describe('resolvePushed', () => {
  it('defaults to not-pushed, so a truncated value retries rather than losing the backfill', () => {
    expect(resolvePushed(() => undefined)).toBe(false);
    expect(resolvePushed(() => 'yes')).toBe(false);
    expect(resolvePushed(() => 'true')).toBe(true);
  });
});

describe('truncateReferrer', () => {
  it('bounds the raw string to what the API accepts', () => {
    expect(truncateReferrer('a'.repeat(250))).toHaveLength(200);
  });

  it('leaves a normal referrer untouched', () => {
    const s = 'utm_source=google-play&utm_medium=organic';
    expect(truncateReferrer(s)).toBe(s);
  });

  it('treats an empty referrer as nothing to store', () => {
    expect(truncateReferrer('')).toBeUndefined();
    expect(truncateReferrer(null)).toBeUndefined();
  });
});

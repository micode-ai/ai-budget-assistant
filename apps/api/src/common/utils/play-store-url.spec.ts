import { PLAY_STORE_URL, playStoreUrl } from './play-store-url';

describe('playStoreUrl', () => {
  it('keeps the bare listing as a prefix and carries our tags plus the utm pair in one referrer', () => {
    const url = playStoreUrl({ src: 'group', loc: 'settled', lang: 'pl' });

    expect(url.startsWith(`${PLAY_STORE_URL}&referrer=`)).toBe(true);
    const referrer = decodeURIComponent(url.split('&referrer=')[1]);
    expect(Object.fromEntries(new URLSearchParams(referrer))).toEqual({
      src: 'group',
      loc: 'settled',
      lang: 'pl',
      utm_source: 'group',
      utm_medium: 'settled',
    });
  });

  it('omits lang when there is none', () => {
    const referrer = decodeURIComponent(playStoreUrl({ src: 'split', loc: 'guest' }).split('&referrer=')[1]);
    expect(referrer).toBe('src=split&loc=guest&utm_source=split&utm_medium=guest');
  });

  it('encodes the referrer so its own & cannot leak into the listing URL', () => {
    const url = playStoreUrl({ src: 'split', loc: 'guest' });
    expect(url.split('&')).toHaveLength(2);
  });
});

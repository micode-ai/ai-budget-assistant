import {
  generateLinkCode,
  normalizeLinkCode,
  linkAttemptAllowed,
  LINK_CODE_ALPHABET,
  LINK_CODE_LENGTH,
  LINK_ATTEMPTS_PER_IDENTITY,
  LINK_ATTEMPTS_PER_PLATFORM,
} from './bot-link-code';

function fakeCache() {
  const counts = new Map<string, number>();
  return {
    incrementWindow: jest.fn(async (key: string) => {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    }),
  } as any;
}

describe('bot link codes (ABA-808)', () => {
  it('generates 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateLinkCode();
      expect(code).toHaveLength(LINK_CODE_LENGTH);
      for (const ch of code) expect(LINK_CODE_ALPHABET).toContain(ch);
    }
    expect(LINK_CODE_ALPHABET).not.toMatch(/[01IOL]/);
  });

  it('normalises what the user typed', () => {
    expect(normalizeLinkCode(' abcd-ef 23 ')).toBe('ABCDEF23');
  });

  it('caps attempts per chat identity', async () => {
    const cache = fakeCache();
    for (let i = 0; i < LINK_ATTEMPTS_PER_IDENTITY; i++) {
      expect(await linkAttemptAllowed(cache, 'telegram', '42')).toBe(true);
    }
    expect(await linkAttemptAllowed(cache, 'telegram', '42')).toBe(false);
    expect(await linkAttemptAllowed(cache, 'telegram', '43')).toBe(true);
  });

  it('caps attempts across a platform, whatever the identity', async () => {
    const cache = fakeCache();
    for (let i = 0; i < LINK_ATTEMPTS_PER_PLATFORM; i++) {
      expect(await linkAttemptAllowed(cache, 'whatsapp', `+48${i}`)).toBe(true);
    }
    expect(await linkAttemptAllowed(cache, 'whatsapp', '+48new')).toBe(false);
    expect(await linkAttemptAllowed(cache, 'slack', 'U1')).toBe(true);
  });

  it('fails closed when Redis is unavailable', async () => {
    const cache = { incrementWindow: jest.fn().mockRejectedValue(new Error('down')) } as any;
    expect(await linkAttemptAllowed(cache, 'slack', 'U1')).toBe(false);
  });
});

import { encryptToken, decryptToken } from './token-crypto';

// 32-byte key as 64 hex chars
const KEY = 'a'.repeat(64);

describe('token-crypto', () => {
  it('round-trips a token', () => {
    const enc = encryptToken('xoxb-123-secret', KEY);
    expect(enc).not.toContain('xoxb-123-secret');
    expect(enc.split(':')).toHaveLength(3);
    expect(decryptToken(enc, KEY)).toBe('xoxb-123-secret');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    expect(encryptToken('same', KEY)).not.toBe(encryptToken('same', KEY));
  });

  it('returns "" on a tampered ciphertext', () => {
    const enc = encryptToken('xoxb-abc', KEY);
    const [iv, tag, data] = enc.split(':');
    const tampered = [iv, tag, Buffer.from('zzzz').toString('base64')].join(':');
    expect(decryptToken(tampered, KEY)).toBe('');
  });

  it('returns "" with the wrong key', () => {
    const enc = encryptToken('xoxb-abc', KEY);
    expect(decryptToken(enc, 'b'.repeat(64))).toBe('');
  });

  it('returns "" on malformed input', () => {
    expect(decryptToken('not-valid', KEY)).toBe('');
    expect(decryptToken('', KEY)).toBe('');
  });
});

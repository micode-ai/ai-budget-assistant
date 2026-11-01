import { generateToken, generateClientId, sha256Hex, verifyPkceS256, safeEqual } from './oauth-crypto.util';

describe('oauth-crypto.util', () => {
  it('generateToken has prefix and 43 base64url chars', () => {
    expect(generateToken('aba_at_')).toMatch(/^aba_at_[A-Za-z0-9_-]{43}$/);
    expect(generateToken('aba_ac_')).toMatch(/^aba_ac_[A-Za-z0-9_-]{43}$/);
    expect(generateToken('aba_at_')).not.toBe(generateToken('aba_at_'));
  });
  it('generateClientId is aba_ci_ + 16 bytes', () => {
    expect(generateClientId()).toMatch(/^aba_ci_[A-Za-z0-9_-]{22}$/);
  });
  it('sha256Hex', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('verifyPkceS256 RFC 7636 vector', () => {
    const v = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const c = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(verifyPkceS256(v, c)).toBe(true);
    expect(verifyPkceS256(v + 'x', c)).toBe(false);
    expect(verifyPkceS256(v.slice(0, 42), c)).toBe(false);
    expect(verifyPkceS256(v + '!', c)).toBe(false);
  });
  it('safeEqual', () => {
    expect(safeEqual('ab12', 'ab12')).toBe(true);
    expect(safeEqual('ab12', 'ab13')).toBe(false);
    expect(safeEqual('ab12', 'ab1')).toBe(false);
  });
});

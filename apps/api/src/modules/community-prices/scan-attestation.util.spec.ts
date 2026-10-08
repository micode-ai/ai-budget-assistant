import {
  attestedLineHash,
  attestedUnitPrice,
  quantityMilli,
  usableCommunitySalt,
  receiptContentKey,
  signScanAttestation,
  verifyScanAttestation,
  SCAN_ATTESTATION_TTL_MS,
  type ScanAttestationPayload,
} from './scan-attestation.util';

const SALT = 'salt';
const NOW = new Date('2026-10-10T12:00:00Z');
const who = { userId: 'u1', accountId: 'a1', now: NOW };

function payload(over: Partial<ScanAttestationPayload> = {}): ScanAttestationPayload {
  return {
    v: 1,
    u: 'u1',
    a: 'a1',
    iat: NOW.getTime() - 1000,
    m: 'biedronka',
    c: 'PLN',
    d: '2026-10-09',
    t: '12:30',
    tot: 1949,
    loc: [52.2297, 21.0122],
    h: [attestedLineHash('Mleko 1L', 1, 3.5), attestedLineHash('Chleb', 2, 7)],
    ...over,
  };
}

describe('scan attestation token', () => {
  it('round-trips', () => {
    const p = payload();
    expect(verifyScanAttestation(SALT, signScanAttestation(SALT, p), who)).toEqual(p);
  });

  it('is `base64url(json).base64url(hmac)` with no padding or separators beyond the dot', () => {
    const t = signScanAttestation(SALT, payload());
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('rejects a tampered payload (re-encoded with a different total) and a tampered signature', () => {
    const t = signScanAttestation(SALT, payload());
    const [body, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify(payload({ tot: 1 })), 'utf8').toString('base64url');
    expect(verifyScanAttestation(SALT, `${forged}.${sig}`, who)).toBeNull();
    expect(verifyScanAttestation(SALT, `${body}.${sig.slice(0, -2)}AA`, who)).toBeNull();
    expect(verifyScanAttestation(SALT, `${body}.`, who)).toBeNull();
  });

  it('rejects a token signed under another salt (salt rotation is a clean break)', () => {
    expect(verifyScanAttestation(SALT, signScanAttestation('other', payload()), who)).toBeNull();
  });

  it('expires after 24 h and rejects a token from the future', () => {
    const old = signScanAttestation(SALT, payload({ iat: NOW.getTime() - SCAN_ATTESTATION_TTL_MS - 1 }));
    expect(verifyScanAttestation(SALT, old, who)).toBeNull();
    const edge = signScanAttestation(SALT, payload({ iat: NOW.getTime() - SCAN_ATTESTATION_TTL_MS + 1000 }));
    expect(verifyScanAttestation(SALT, edge, who)).not.toBeNull();
    const future = signScanAttestation(SALT, payload({ iat: NOW.getTime() + 60_000 }));
    expect(verifyScanAttestation(SALT, future, who)).toBeNull();
  });

  it('is bound to the user AND the account', () => {
    const t = signScanAttestation(SALT, payload());
    expect(verifyScanAttestation(SALT, t, { ...who, userId: 'u2' })).toBeNull();
    expect(verifyScanAttestation(SALT, t, { ...who, accountId: 'a2' })).toBeNull();
  });

  it('issues nothing usable without a salt, and rejects missing/oversized tokens', () => {
    const t = signScanAttestation(SALT, payload());
    expect(verifyScanAttestation('', t, who)).toBeNull();
    expect(verifyScanAttestation(SALT, undefined, who)).toBeNull();
    expect(verifyScanAttestation(SALT, 'x'.repeat(9000), who)).toBeNull();
  });

  it('rejects structurally invalid payloads even when correctly signed', () => {
    for (const bad of [
      payload({ v: 2 as any }),
      payload({ d: '10/10/2026' }),
      payload({ h: [] }),
      payload({ h: ['not-hex-not-hex!'] }),
      payload({ loc: [1] as any }),
    ]) {
      expect(verifyScanAttestation(SALT, signScanAttestation(SALT, bad), who)).toBeNull();
    }
  });
});

describe('attestedLineHash', () => {
  it('is 16 lowercase hex characters and deterministic', () => {
    const h = attestedLineHash('Mleko 1L', 1, 3.5);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(attestedLineHash('Mleko 1L', 1, 3.5)).toBe(h);
  });

  it('an edited line does not match: name, quantity or price changes all change the hash', () => {
    const h = attestedLineHash('Mleko 1L', 1, 3.5);
    expect(attestedLineHash('Mleko 2L', 1, 3.5)).not.toBe(h);
    expect(attestedLineHash('Mleko 1L', 2, 3.5)).not.toBe(h);
    expect(attestedLineHash('Mleko 1L', 1, 3.51)).not.toBe(h);
  });

  it('is stable across float noise and Decimal-style quantity strings', () => {
    expect(attestedLineHash('X', 1, 0.1 + 0.2)).toBe(attestedLineHash('X', 1, 0.3));
    expect(attestedLineHash('X', Number('1.000'), 3.5)).toBe(attestedLineHash('X', 1, 3.5));
  });

  it('treats a missing or non-positive quantity as 1, like the saved row default', () => {
    expect(attestedLineHash('X', 0, 3.5)).toBe(attestedLineHash('X', 1, 3.5));
    expect(attestedLineHash('X', NaN, 3.5)).toBe(attestedLineHash('X', 1, 3.5));
  });
});

describe('receiptContentKey', () => {
  it('is independent of line order, user and issue time, and carries no identity', () => {
    const a = payload();
    const b = payload({ u: 'u2', a: 'a2', iat: 5, h: [...a.h].reverse() });
    expect(receiptContentKey(SALT, a)).toBe(receiptContentKey(SALT, b));
    expect(receiptContentKey(SALT, a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for a different receipt and under a different salt', () => {
    expect(receiptContentKey(SALT, payload())).not.toBe(receiptContentKey(SALT, payload({ tot: 2000 })));
    expect(receiptContentKey(SALT, payload())).not.toBe(receiptContentKey('other', payload()));
  });
});

describe('ABA-642 audit: exact integer-thousandths quantities', () => {
  it('quantises like Decimal(10,3): an OCR float and the saved Decimal agree', () => {
    // OCR read 0.3334; the DB column stores 0.333 — same attested line.
    expect(quantityMilli(0.3334)).toBe(333);
    expect(attestedLineHash('X', 0.3334, 5)).toBe(attestedLineHash('X', Number('0.333'), 5));
    expect(attestedLineHash('X', 0.333, 5)).not.toBe(attestedLineHash('X', 0.334, 5));
  });

  it('derives the unit price from the attested integers only', () => {
    expect(attestedUnitPrice(0.333, 5)).toBe(15.02);
    expect(attestedUnitPrice(2, 7)).toBe(3.5);
    expect(attestedUnitPrice(0, 3.5)).toBe(3.5); // no quantity = one unit
  });
});

describe('ABA-642 audit: stable receipt content key', () => {
  it('does not depend on line contents, only on the receipt header and the line COUNT', () => {
    const a = payload({ h: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] });
    const b = payload({ h: ['cccccccccccccccc', 'dddddddddddddddd'] }); // a second OCR read differing per line
    expect(receiptContentKey(SALT, a)).toBe(receiptContentKey(SALT, b));
    expect(receiptContentKey(SALT, a)).not.toBe(
      receiptContentKey(SALT, payload({ h: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', 'cccccccccccccccc'] })),
    );
  });
});

describe('usableCommunitySalt', () => {
  it('rejects unset and short salts, accepts >= 32 characters', () => {
    expect(usableCommunitySalt(undefined)).toBeNull();
    expect(usableCommunitySalt('x'.repeat(31))).toBeNull();
    expect(usableCommunitySalt('x'.repeat(32))).toBe('x'.repeat(32));
  });
});

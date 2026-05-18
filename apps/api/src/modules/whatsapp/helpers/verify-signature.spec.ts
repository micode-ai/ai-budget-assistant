import { createHmac } from 'crypto';
import { verifySignature } from './verify-signature';

const SECRET = 'test_app_secret';
const RAW = Buffer.from('{"foo":"bar"}', 'utf-8');
const VALID_SIG = 'sha256=' + createHmac('sha256', SECRET).update(RAW).digest('hex');

describe('verifySignature', () => {
  it('accepts a valid signature', () => {
    expect(verifySignature(RAW, VALID_SIG, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from('{"foo":"baz"}', 'utf-8');
    expect(verifySignature(tampered, VALID_SIG, SECRET)).toBe(false);
  });

  it('rejects a malformed header (no sha256= prefix)', () => {
    const noPrefix = VALID_SIG.replace('sha256=', '');
    expect(verifySignature(RAW, noPrefix, SECRET)).toBe(false);
  });

  it('rejects an empty or missing signature header', () => {
    expect(verifySignature(RAW, '', SECRET)).toBe(false);
    expect(verifySignature(RAW, undefined, SECRET)).toBe(false);
  });

  it('rejects a signature signed with a different secret', () => {
    const wrongSig = 'sha256=' + createHmac('sha256', 'wrong_secret').update(RAW).digest('hex');
    expect(verifySignature(RAW, wrongSig, SECRET)).toBe(false);
  });
});

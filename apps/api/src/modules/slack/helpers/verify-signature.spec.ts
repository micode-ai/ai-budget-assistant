import { createHmac } from 'crypto';
import { verifySlackSignature } from './verify-signature';

const SECRET = 'test_signing_secret';

function sign(timestamp: string, body: string): string {
  const base = `v0:${timestamp}:${body}`;
  return 'v0=' + createHmac('sha256', SECRET).update(base).digest('hex');
}

describe('verifySlackSignature', () => {
  const body = '{"type":"event_callback"}';
  const now = () => Math.floor(Date.now() / 1000);

  it('accepts a valid, fresh signature', () => {
    const ts = String(now());
    expect(verifySlackSignature(Buffer.from(body), ts, sign(ts, body), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const ts = String(now());
    const sig = sign(ts, body);
    expect(verifySlackSignature(Buffer.from(body + 'x'), ts, sig, SECRET)).toBe(false);
  });

  it('rejects a stale timestamp (> 5 min old)', () => {
    const ts = String(now() - 60 * 6);
    expect(verifySlackSignature(Buffer.from(body), ts, sign(ts, body), SECRET)).toBe(false);
  });

  it('rejects missing/garbage header', () => {
    const ts = String(now());
    expect(verifySlackSignature(Buffer.from(body), ts, undefined, SECRET)).toBe(false);
    expect(verifySlackSignature(Buffer.from(body), ts, 'garbage', SECRET)).toBe(false);
  });

  it('rejects a missing timestamp', () => {
    const ts = String(now());
    expect(verifySlackSignature(Buffer.from(body), undefined, sign(ts, body), SECRET)).toBe(false);
  });

  it('rejects a future timestamp (> 5 min ahead)', () => {
    const ts = String(now() + 60 * 6);
    expect(verifySlackSignature(Buffer.from(body), ts, sign(ts, body), SECRET)).toBe(false);
  });

  it('rejects a valid signature made with the wrong secret', () => {
    const ts = String(now());
    expect(verifySlackSignature(Buffer.from(body), ts, sign(ts, body), 'different_secret')).toBe(false);
  });
});

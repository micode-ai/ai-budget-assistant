import { createHmac } from 'crypto';
import { verifySignature } from './verify-signature';
import { verifySlackSignature } from '../../slack/helpers/verify-signature';

/** ABA-809: an HMAC keyed by '' is computable by anyone, so an unset secret accepts nothing. */
describe('webhook signatures with no secret configured', () => {
  const body = Buffer.from('{"x":1}');

  it('WhatsApp rejects even a correctly computed empty-key signature', () => {
    const sig = 'sha256=' + createHmac('sha256', '').update(body).digest('hex');
    expect(verifySignature(body, sig, '')).toBe(false);
  });

  it('Slack rejects even a correctly computed empty-key signature', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = 'v0=' + createHmac('sha256', '').update(`v0:${ts}:${body.toString('utf8')}`).digest('hex');
    expect(verifySlackSignature(body, ts, sig, '')).toBe(false);
  });
});

import { EML_DATE_MS, buildEml, PASSING_AUTH } from './eml.testutil';
import { extractMessage } from './extract';
import type { AuthSummary } from './policy';

const base = { remoteIp: '203.0.113.9', helo: 'mx.shop.example', envelopeFrom: 'orders@shop.example' };
const TOKEN_ADDR = 'abcdefghijklmnop@in.ai-budget.pl';
const googleAuth: AuthSummary = {
  ...PASSING_AUTH,
  dkim: [{ domain: 'google.com', result: 'pass', aligned: true }],
  headerFrom: ['forwarding-noreply@google.com'],
};
const from = 'Gmail Team <forwarding-noreply@google.com>';
const vctx = { ...base, auth: googleAuth, recipients: [TOKEN_ADDR], now: EML_DATE_MS + 60_000 };
const text = 'Confirmation code: 123456';

describe('extractMessage: Gmail forwarding verification', () => {
  it('detects the English code and forwards no body or attachment', async () => {
    const m = await extractMessage(
      buildEml({
        from,
        subject: 'Gmail Forwarding Confirmation - Receive Mail from user@gmail.com',
        text: 'user@gmail.com has requested to automatically forward mail to you. Confirmation code: 123456',
      }),
      vctx,
    );
    expect(m).toMatchObject({ kind: 'forwarding_verification', verificationCode: '123456', ignoredAttachmentCount: 0 });
    expect(m.document).toBeUndefined();
  });

  it('detects the Polish variant', async () => {
    const m = await extractMessage(buildEml({ from, text: 'Kod potwierdzenia: 987654321' }), vctx);
    expect(m.verificationCode).toBe('987654321');
  });

  it('falls back to the (#code) in the subject', async () => {
    const m = await extractMessage(buildEml({ from, subject: '(#555444) Gmail Forwarding Confirmation', text: 'see subject' }), vctx);
    expect(m.verificationCode).toBe('555444');
  });

  it('does NOT trust a spoofed forwarding-noreply without a google.com DKIM pass', async () => {
    const m = await extractMessage(buildEml({ from, text }), {
      ...vctx,
      auth: { ...googleAuth, dkim: [{ domain: 'evil.example', result: 'pass', aligned: true }] },
    });
    expect(m.kind).toBe('receipt');
    expect(m.verificationCode).toBeUndefined();
  });

  it('ignores a google.com DKIM that failed', async () => {
    const m = await extractMessage(buildEml({ from, text }), {
      ...vctx,
      auth: { ...googleAuth, dkim: [{ domain: 'google.com', result: 'fail', aligned: true }] },
    });
    expect(m.kind).toBe('receipt');
  });

  it('a code from a normal sender is not a verification', async () => {
    const m = await extractMessage(buildEml({ text }), { ...vctx, auth: { ...googleAuth, headerFrom: ['orders@shop.example'] } });
    expect(m.kind).toBe('receipt');
  });
});

describe('extractMessage: verification binding (ABA-644 audit M1)', () => {
  it('refuses a google.com signature that is not aligned with the From domain', async () => {
    const m = await extractMessage(buildEml({ from, text }), {
      ...vctx,
      auth: { ...googleAuth, dkim: [{ domain: 'google.com', result: 'pass', aligned: false }] },
    });
    expect(m.kind).toBe('receipt');
  });

  it('refuses when mailauth saw more than one From address', async () => {
    const m = await extractMessage(buildEml({ from, text }), {
      ...vctx,
      auth: { ...googleAuth, headerFrom: ['forwarding-noreply@google.com', 'attacker@evil.example'] },
    });
    expect(m.kind).toBe('receipt');
  });

  it('refuses when the authenticated header From differs from the parsed From', async () => {
    const m = await extractMessage(buildEml({ from, text }), {
      ...vctx,
      auth: { ...googleAuth, headerFrom: ['someone-else@google.com'] },
    });
    expect(m.kind).toBe('receipt');
  });

  it('refuses when mailauth reports no header From at all', async () => {
    const m = await extractMessage(buildEml({ from, text }), { ...vctx, auth: { ...googleAuth, headerFrom: undefined } });
    expect(m.kind).toBe('receipt');
  });

  it('refuses a duplicated From header (whichever one mailparser picks)', async () => {
    const m = await extractMessage(buildEml({ from, text, extraHeaders: ['From: Mallory <mallory@evil.example>'] }), vctx);
    expect(m.kind).toBe('receipt');
    expect(m.verificationCode).toBeUndefined();
  });

  it('refuses a duplicated Subject header', async () => {
    const m = await extractMessage(
      buildEml({ from, text, subject: '(#111111) one', extraHeaders: ['Subject: (#222222) two'] }),
      vctx,
    );
    expect(m.kind).toBe('receipt');
  });

  it('refuses a duplicated Date header', async () => {
    const m = await extractMessage(buildEml({ from, text, extraHeaders: ['Date: Thu, 08 Oct 2026 10:01:00 +0000'] }), vctx);
    expect(m.kind).toBe('receipt');
  });

  it('refuses a message not addressed to the RCPT token address', async () => {
    const m = await extractMessage(buildEml({ from, text, to: 'victim@gmail.com' }), vctx);
    expect(m.kind).toBe('receipt');
  });

  it('accepts a Delivered-To header equal to the RCPT address when To differs', async () => {
    const m = await extractMessage(
      buildEml({ from, text, to: 'victim@gmail.com', extraHeaders: [`Delivered-To: ${TOKEN_ADDR}`] }),
      vctx,
    );
    expect(m.kind).toBe('forwarding_verification');
  });

  it('accepts the RCPT address in the body when the headers name someone else', async () => {
    const m = await extractMessage(
      buildEml({ from, to: 'victim@gmail.com', text: `${TOKEN_ADDR} has requested to forward mail. Confirmation code: 424242` }),
      vctx,
    );
    expect(m.verificationCode).toBe('424242');
  });

  it('refuses when the transaction recipients are unknown to the extractor', async () => {
    const m = await extractMessage(buildEml({ from, text }), { ...vctx, recipients: undefined });
    expect(m.kind).toBe('receipt');
  });

  it('refuses a Date more than 30 minutes from now (replay / future-dated)', async () => {
    const old = await extractMessage(buildEml({ from, text }), { ...vctx, now: EML_DATE_MS + 31 * 60_000 });
    expect(old.kind).toBe('receipt');
    const future = await extractMessage(buildEml({ from, text }), { ...vctx, now: EML_DATE_MS - 31 * 60_000 });
    expect(future.kind).toBe('receipt');
    const edge = await extractMessage(buildEml({ from, text }), { ...vctx, now: EML_DATE_MS + 29 * 60_000 });
    expect(edge.kind).toBe('forwarding_verification');
  });

  it('refuses a verification with no parsable Date', async () => {
    const m = await extractMessage(buildEml({ from, text, date: 'not a date' }), vctx);
    expect(m.kind).toBe('receipt');
  });
});

describe('extractMessage: hostile structure (ABA-644 audit M3)', () => {
  it('survives deeply nested multipart without crashing or hanging', async () => {
    let inner = 'Content-Type: text/plain\r\n\r\nTotal 5 PLN\r\n';
    for (let i = 0; i < 400; i++) {
      inner = `Content-Type: multipart/mixed; boundary="b${i}"\r\n\r\n--b${i}\r\n${inner}\r\n--b${i}--\r\n`;
    }
    const raw = Buffer.from(
      `From: a@shop.example\r\nTo: ${TOKEN_ADDR}\r\nSubject: nested\r\nDate: Thu, 08 Oct 2026 10:00:00 +0000\r\nMIME-Version: 1.0\r\n${inner}`,
    );
    const started = Date.now();
    const m = await extractMessage(raw, { ...base, auth: PASSING_AUTH }).catch(() => null);
    expect(Date.now() - started).toBeLessThan(10_000);
    if (m) expect(m.kind).toBe('receipt');
  });

  it('caps oversized HTML before html-to-text sees it', async () => {
    const m = await extractMessage(buildEml({ html: `<p>${'a'.repeat(600_000)}</p>` }), { ...base, auth: PASSING_AUTH });
    expect((m.document?.text ?? '').length).toBeLessThanOrEqual(100_000);
  });
});

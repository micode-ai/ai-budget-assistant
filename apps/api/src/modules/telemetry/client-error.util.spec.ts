import {
  clientErrorFingerprint,
  escapeTelegramHtml,
  firstStackFrame,
  redactClientText,
  truncate,
} from './client-error.util';

describe('client-error.util', () => {
  describe('redactClientText', () => {
    it('strips bearer tokens, bare JWTs and e-mail addresses', () => {
      const text =
        'Failed: Authorization Bearer abc.DEF-123_x= for jan.kowalski@example.pl token eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl';
      const out = redactClientText(text);
      expect(out).toContain('Bearer [redacted]');
      expect(out).toContain('[email]');
      expect(out).toContain('[jwt]');
      expect(out).not.toContain('jan.kowalski');
      expect(out).not.toContain('abc.DEF');
      expect(out).not.toContain('eyJzdWIiOiIx');
    });

    it('leaves an ordinary error message alone', () => {
      const msg = "TypeError: Cannot read property 'name' of undefined";
      expect(redactClientText(msg)).toBe(msg);
    });
  });

  it('truncate cuts only what is over the limit', () => {
    expect(truncate('abc', 5)).toBe('abc');
    expect(truncate('abcdef', 3)).toBe('abc');
  });

  describe('firstStackFrame', () => {
    it('skips the "Error: message" header of a V8/Hermes stack', () => {
      const stack = 'TypeError: boom\n    at render (index.bundle:1:2)\n    at next (x:3:4)';
      expect(firstStackFrame(stack)).toBe('at render (index.bundle:1:2)');
    });

    it('reads a JSC/Firefox-style frame', () => {
      expect(firstStackFrame('render@http://x/app.js:10:5\nnext@x:1:1')).toBe(
        'render@http://x/app.js:10:5',
      );
    });

    it('falls back to the first line, and to empty for no stack', () => {
      expect(firstStackFrame('just a line')).toBe('just a line');
      expect(firstStackFrame('')).toBe('');
    });
  });

  describe('clientErrorFingerprint', () => {
    const stack = 'TypeError: boom\n    at render (index.bundle:1:2)';

    it('is stable and ignores frames below the first', () => {
      const a = clientErrorFingerprint('boom', stack);
      const b = clientErrorFingerprint('boom', `${stack}\n    at somethingElse (y:9:9)`);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{40}$/);
    });

    it('differs when the message or the first frame differs', () => {
      const a = clientErrorFingerprint('boom', stack);
      expect(clientErrorFingerprint('bang', stack)).not.toBe(a);
      expect(clientErrorFingerprint('boom', 'TypeError: boom\n    at other (z:1:1)')).not.toBe(a);
    });
  });

  it('escapeTelegramHtml escapes the three HTML-significant characters', () => {
    expect(escapeTelegramHtml('<View> & </Text>')).toBe('&lt;View&gt; &amp; &lt;/Text&gt;');
  });
});

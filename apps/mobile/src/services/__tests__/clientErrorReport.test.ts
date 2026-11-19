import {
  CLIENT_ERROR_LIMITS,
  buildClientErrorPayload,
  createSessionDedupe,
  errorKey,
  firstStackFrame,
  shortErrorMessage,
  toErrorParts,
  truncate,
} from '../clientErrorReport';

describe('toErrorParts', () => {
  it('reads an Error', () => {
    const e = new TypeError('boom');
    const parts = toErrorParts(e);
    expect(parts.message).toBe('boom');
    expect(parts.stack).toContain('boom');
  });

  it('reads a thrown string, an error-like object and junk', () => {
    expect(toErrorParts('plain')).toEqual({ message: 'plain', stack: '' });
    expect(toErrorParts({ message: 'like', stack: 'at x' })).toEqual({ message: 'like', stack: 'at x' });
    expect(toErrorParts(undefined).message).toBe('Unknown error');
    expect(toErrorParts(42).message).toBe('42');
  });
});

describe('firstStackFrame / errorKey', () => {
  it('skips the header of a Hermes/V8 stack', () => {
    expect(firstStackFrame('TypeError: boom\n    at render (index.bundle:1:2)\n    at x (y:1:1)')).toBe(
      'at render (index.bundle:1:2)',
    );
  });

  it('reads a JSC-style frame', () => {
    expect(firstStackFrame('render@http://x/app.js:10:5\nnext@x:1:1')).toBe('render@http://x/app.js:10:5');
  });

  it('keys on message + first frame only', () => {
    const a = errorKey('boom', 'Error: boom\n    at render (a:1:1)\n    at deeper (b:2:2)');
    const b = errorKey('boom', 'Error: boom\n    at render (a:1:1)\n    at other (c:3:3)');
    expect(a).toBe(b);
    expect(errorKey('bang', 'Error: bang\n    at render (a:1:1)')).not.toBe(a);
  });
});

describe('createSessionDedupe', () => {
  it('lets a key through once — a render loop sends one report', () => {
    const firstTime = createSessionDedupe();
    expect(firstTime('k')).toBe(true);
    expect(firstTime('k')).toBe(false);
    expect(firstTime('k')).toBe(false);
    expect(firstTime('other')).toBe(true);
  });

  it('stops everything after the per-session cap', () => {
    const firstTime = createSessionDedupe(2);
    expect(firstTime('a')).toBe(true);
    expect(firstTime('b')).toBe(true);
    expect(firstTime('c')).toBe(false);
  });
});

describe('shortErrorMessage', () => {
  it('collapses whitespace and truncates with an ellipsis', () => {
    const msg = shortErrorMessage(new Error(`line one\n\n  line two ${'x'.repeat(300)}`), 20);
    expect(msg).toHaveLength(20);
    expect(msg.startsWith('line one line two')).toBe(true);
    expect(msg.endsWith('…')).toBe(true);
  });

  it('leaves a short message intact', () => {
    expect(shortErrorMessage(new Error('boom'))).toBe('boom');
  });
});

describe('buildClientErrorPayload', () => {
  const ctx = { platform: 'android', appVersion: '1.42.0 (310)', route: '(tabs)/index', locale: 'pt' };

  it('truncates every free-text field to the server limits', () => {
    const payload = buildClientErrorPayload(
      { message: 'm'.repeat(5000), stack: 's'.repeat(20000) },
      'c'.repeat(20000),
      true,
      { ...ctx, route: 'r'.repeat(500), locale: 'l'.repeat(50) },
    );
    expect(payload.message).toHaveLength(CLIENT_ERROR_LIMITS.message);
    expect(payload.stack).toHaveLength(CLIENT_ERROR_LIMITS.stack);
    expect(payload.componentStack).toHaveLength(CLIENT_ERROR_LIMITS.componentStack);
    expect(payload.route).toHaveLength(CLIENT_ERROR_LIMITS.route);
    expect(payload.locale).toHaveLength(CLIENT_ERROR_LIMITS.locale);
    expect(payload.fatal).toBe(true);
  });

  it('omits empty optional fields rather than sending empty strings or nulls', () => {
    const payload = buildClientErrorPayload({ message: 'boom', stack: '' }, undefined, false, {
      platform: 'web',
      appVersion: '1.42.0+abc1234',
      route: null,
      locale: null,
    });
    expect(payload).toEqual({ platform: 'web', appVersion: '1.42.0+abc1234', message: 'boom', fatal: false });
  });

  it('truncate is a no-op under the limit', () => {
    expect(truncate('abc', 10)).toBe('abc');
  });
});

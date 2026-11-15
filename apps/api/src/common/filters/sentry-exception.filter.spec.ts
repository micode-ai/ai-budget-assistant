import { HttpException } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { SentryExceptionFilter } from './sentry-exception.filter';

jest.mock('@sentry/node', () => ({
  withScope: (cb: (s: unknown) => void) => cb({ setUser: jest.fn(), setContext: jest.fn() }),
  captureException: jest.fn(),
}));

function host(url = '/api/v1/expenses?token=secret') {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url }),
      getResponse: () => ({}),
    }),
  } as any;
}

describe('SentryExceptionFilter admin feed', () => {
  let superCatch: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    superCatch = jest
      .spyOn(Object.getPrototypeOf(SentryExceptionFilter.prototype), 'catch')
      .mockImplementation(() => undefined);
  });
  afterEach(() => superCatch.mockRestore());

  it('emits admin:error for 5xx without query string or stack', () => {
    const gw = { emitError: jest.fn() };
    new SentryExceptionFilter(gw as any).catch(new Error('db down'), host());
    const arg = gw.emitError.mock.calls[0][0];
    expect(arg.message).toContain('500 GET /api/v1/expenses: db down');
    expect(arg.message).not.toContain('secret');
    expect(arg.stack).toBeUndefined();
  });

  it('does not report the expected OAuth 503 temporarily_unavailable', () => {
    const gw = { emitError: jest.fn() };
    const e = new HttpException({ error: 'temporarily_unavailable', error_description: 'please try again' }, 503);
    new SentryExceptionFilter(gw as any).catch(e, host('/oauth/token'));
    expect(gw.emitError).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('still reports any other 503', () => {
    const gw = { emitError: jest.fn() };
    new SentryExceptionFilter(gw as any).catch(new HttpException('down', 503), host());
    expect(gw.emitError).toHaveBeenCalledTimes(1);
  });

  it('does not emit for 4xx', () => {
    const gw = { emitError: jest.fn() };
    new SentryExceptionFilter(gw as any).catch(new HttpException('nope', 400), host());
    expect(gw.emitError).not.toHaveBeenCalled();
  });

  it('survives a throwing or absent gateway', () => {
    const gw = { emitError: jest.fn(() => { throw new Error('x'); }) };
    expect(() => new SentryExceptionFilter(gw as any).catch(new Error('e'), host())).not.toThrow();
    expect(() => new SentryExceptionFilter().catch(new Error('e'), host())).not.toThrow();
    expect(superCatch).toHaveBeenCalledTimes(2);
  });
});

describe('SentryExceptionFilter client errors raised before Nest routing', () => {
  let superCatch: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    superCatch = jest
      .spyOn(Object.getPrototypeOf(SentryExceptionFilter.prototype), 'catch')
      .mockImplementation(() => undefined);
  });
  afterEach(() => superCatch.mockRestore());

  // Shape of the http-errors object body-parser throws (Sentry 2026-11-14: a scanner POSTed a
  // brotli body to /webhook and it was reported, and answered, as a 500).
  function bodyParserError(status: number, message: string, type: string) {
    return Object.assign(new Error(message), { status, statusCode: status, expose: true, type });
  }

  it('answers an unsupported content encoding with its own 415 and does not report it', () => {
    const gw = { emitError: jest.fn() };
    new SentryExceptionFilter(gw as any).catch(
      bodyParserError(415, 'unsupported content encoding "br"', 'encoding.unsupported'),
      host('/webhook'),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(gw.emitError).not.toHaveBeenCalled();
    const forwarded = superCatch.mock.calls[0][0];
    expect(forwarded).toBeInstanceOf(HttpException);
    expect(forwarded.getStatus()).toBe(415);
  });

  it('answers malformed JSON with 400', () => {
    new SentryExceptionFilter().catch(
      bodyParserError(400, 'Unexpected token } in JSON', 'entity.parse.failed'),
      host(),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(superCatch.mock.calls[0][0].getStatus()).toBe(400);
  });

  it('still reports an error that carries a 4xx status but is not marked safe to expose', () => {
    const e = Object.assign(new Error('internal'), { status: 404 });
    new SentryExceptionFilter().catch(e, host());
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

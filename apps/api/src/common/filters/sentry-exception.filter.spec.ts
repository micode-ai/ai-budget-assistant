import { HttpException } from '@nestjs/common';
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

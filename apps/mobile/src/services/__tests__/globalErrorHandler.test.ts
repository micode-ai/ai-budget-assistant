import {
  installGlobalErrorHandler,
  resetGlobalErrorHandlerForTests,
  type ErrorUtilsLike,
} from '../globalErrorHandler';

function fakeErrorUtils(previous?: jest.Mock) {
  let handler: ((e: unknown, fatal?: boolean) => void) | undefined = previous;
  const utils: ErrorUtilsLike = {
    getGlobalHandler: () => handler,
    setGlobalHandler: (h) => {
      handler = h;
    },
  };
  return { utils, fire: (e: unknown, fatal?: boolean) => handler?.(e, fatal) };
}

describe('installGlobalErrorHandler', () => {
  beforeEach(() => {
    resetGlobalErrorHandlerForTests();
    jest.useRealTimers();
  });

  it('reports a non-fatal error and calls the previous handler straight away', () => {
    const previous = jest.fn();
    const report = jest.fn().mockResolvedValue(undefined);
    const { utils, fire } = fakeErrorUtils(previous);

    expect(installGlobalErrorHandler(utils, report)).toBe(true);
    const err = new Error('boom');
    fire(err, false);

    expect(report).toHaveBeenCalledWith({ error: err, fatal: false });
    expect(previous).toHaveBeenCalledWith(err, false);
  });

  it('holds a fatal error until the report settles, then calls the previous handler once', async () => {
    const previous = jest.fn();
    let settle!: () => void;
    const report = jest.fn(() => new Promise<void>((r) => (settle = r)));
    const { utils, fire } = fakeErrorUtils(previous);
    installGlobalErrorHandler(utils, report, 50);

    fire(new Error('fatal'), true);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ fatal: true }));
    expect(previous).not.toHaveBeenCalled();

    settle();
    await new Promise((r) => setTimeout(r, 0));
    expect(previous).toHaveBeenCalledTimes(1);
    // Let the fallback timer fire too: it must not call the handler a second time.
    await new Promise((r) => setTimeout(r, 60));
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('does not wait past the timeout for a fatal error', () => {
    jest.useFakeTimers();
    const previous = jest.fn();
    const report = jest.fn(() => new Promise<void>(() => {}));
    const { utils, fire } = fakeErrorUtils(previous);
    installGlobalErrorHandler(utils, report, 1500);

    fire(new Error('fatal'), true);
    jest.advanceTimersByTime(1499);
    expect(previous).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(previous).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('still calls the previous handler when the reporter throws synchronously', () => {
    const previous = jest.fn();
    const report = jest.fn(() => {
      throw new Error('reporter bug');
    });
    const { utils, fire } = fakeErrorUtils(previous);
    installGlobalErrorHandler(utils, report as never);

    fire(new Error('boom'), false);
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('installs once, and does nothing without ErrorUtils (web)', () => {
    const report = jest.fn().mockResolvedValue(undefined);
    expect(installGlobalErrorHandler(undefined, report)).toBe(false);
    const { utils } = fakeErrorUtils();
    expect(installGlobalErrorHandler(utils, report)).toBe(true);
    expect(installGlobalErrorHandler(utils, report)).toBe(false);
  });
});

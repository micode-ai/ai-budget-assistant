import { ValidationPipe } from '@nestjs/common';
import { ClientErrorsService } from './client-errors.service';
import { ReportClientErrorDto } from './dto';
import { CLIENT_ERROR_LIMITS } from './client-error.util';

function makeService(opts: { isNew?: boolean; createFails?: boolean } = {}) {
  const create = opts.createFails
    ? jest.fn().mockRejectedValue(new Error('db down'))
    : jest.fn().mockResolvedValue({});
  const prisma = { clientError: { create } };
  const setIfAbsent = jest.fn().mockResolvedValue(opts.isNew ?? true);
  const cache = { setIfAbsent };
  const sendMessage = jest.fn().mockResolvedValue(true);
  const telegram = { sendMessage };
  const service = new ClientErrorsService(prisma as never, cache as never, telegram as never);
  return { service, create, setIfAbsent, sendMessage };
}

const flush = () => new Promise((r) => setImmediate(r));

const baseDto: ReportClientErrorDto = {
  platform: 'android',
  appVersion: '1.42.0 (310)',
  message: "TypeError: Cannot read property 'x' of undefined",
  stack: "TypeError: Cannot read property 'x' of undefined\n    at HomeWidget (index.bundle:1:2)",
  componentStack: '\n    in HomeWidget\n    in DashboardMobile',
  route: '(tabs)/index',
  fatal: false,
  locale: 'pt',
};

describe('ClientErrorsService', () => {
  it('stores the report under the caller, with a fingerprint', async () => {
    const { service, create } = makeService();

    await service.report('user-1', baseDto);

    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: 'user-1',
      platform: 'android',
      appVersion: '1.42.0 (310)',
      route: '(tabs)/index',
      locale: 'pt',
      fatal: false,
    });
    expect(data.fingerprint).toMatch(/^[0-9a-f]{40}$/);
  });

  it('truncates to the stored limits and redacts e-mails and tokens', async () => {
    const { service, create } = makeService();

    await service.report('user-1', {
      ...baseDto,
      message: `failed for a@b.com ${'x'.repeat(1990)}`,
      stack: `Bearer secret.token.value\n${'y'.repeat(15000)}`,
      componentStack: 'z'.repeat(15000),
    });

    const data = create.mock.calls[0][0].data;
    expect(data.message.length).toBe(CLIENT_ERROR_LIMITS.message);
    expect(data.message).not.toContain('a@b.com');
    expect(data.stack.length).toBe(CLIENT_ERROR_LIMITS.stack);
    expect(data.stack).not.toContain('secret.token');
    expect(data.componentStack.length).toBe(CLIENT_ERROR_LIMITS.componentStack);
  });

  it('fills absent optional fields with empty/null, never undefined', async () => {
    const { service, create } = makeService();

    await service.report('user-1', {
      platform: 'web',
      appVersion: '1.42.0',
      message: 'boom',
      fatal: true,
    });

    expect(create.mock.calls[0][0].data).toMatchObject({
      stack: '',
      componentStack: '',
      route: null,
      locale: null,
      fatal: true,
    });
  });

  it('alerts the ops channel once for a fingerprint new in 24h', async () => {
    const { service, setIfAbsent, sendMessage } = makeService({ isNew: true });

    await service.report('user-1', { ...baseDto, message: '<View> broke & died' });
    await flush();

    expect(setIfAbsent).toHaveBeenCalledWith(
      expect.stringMatching(/^client-error:[0-9a-f]{40}$/),
      86400,
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const text = sendMessage.mock.calls[0][0] as string;
    expect(text).toContain('android 1.42.0 (310)');
    expect(text).toContain('user-1');
    expect(text).toContain('&lt;View&gt; broke &amp; died');
    expect(text).toContain('at HomeWidget (index.bundle:1:2)');
  });

  it('does not alert for a fingerprint already seen (or when Redis is down)', async () => {
    const { service, sendMessage } = makeService({ isNew: false });

    await service.report('user-1', baseDto);
    await flush();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('never throws on a storage failure and still alerts', async () => {
    const { service, sendMessage } = makeService({ createFails: true });

    await expect(service.report('user-1', baseDto)).resolves.toBeUndefined();
    await flush();

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('a failed alert does not reject the report', async () => {
    const { service, sendMessage } = makeService();
    sendMessage.mockRejectedValue(new Error('telegram down'));

    await expect(service.report('user-1', baseDto)).resolves.toBeUndefined();
    await flush();
  });
});

describe('ReportClientErrorDto under the global ValidationPipe', () => {
  // Mirrors apps/api/src/main.ts's app.useGlobalPipes(...) options.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const transform = (payload: unknown) =>
    pipe.transform(payload, { type: 'body', metatype: ReportClientErrorDto, data: '' });

  it('accepts a full report', async () => {
    await expect(transform(baseDto)).resolves.toBeInstanceOf(ReportClientErrorDto);
  });

  it('accepts a stack above the stored limit — the service truncates, the pipe must not 400', async () => {
    await expect(transform({ ...baseDto, stack: 'y'.repeat(12000) })).resolves.toBeDefined();
  });

  it('rejects a missing message or fatal flag', async () => {
    const noMessage: Partial<ReportClientErrorDto> = { ...baseDto };
    delete noMessage.message;
    await expect(transform(noMessage)).rejects.toBeDefined();
    const noFatal: Partial<ReportClientErrorDto> = { ...baseDto };
    delete noFatal.fatal;
    await expect(transform(noFatal)).rejects.toBeDefined();
  });

  it('rejects an unknown field', async () => {
    await expect(transform({ ...baseDto, email: 'a@b.com' })).rejects.toBeDefined();
  });

  it('rejects a payload past the transport ceiling', async () => {
    await expect(transform({ ...baseDto, message: 'x'.repeat(2001) })).rejects.toBeDefined();
  });
});

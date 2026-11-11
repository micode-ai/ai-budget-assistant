import { GUARDS_METADATA } from '@nestjs/common/constants';
import { LeafletsController } from './leaflets.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';

function req(email = 'user@example.com') {
  return { accountId: 'acc1', user: { id: 'u1', email } } as any;
}

describe('LeafletsController', () => {
  const OLD = process.env.ADMIN_EMAILS;
  let service: any;
  let budget: any;
  let controller: LeafletsController;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'Boss@Example.com, other@example.com';
    service = {
      create: jest.fn().mockResolvedValue({ id: 'lf1' }),
      readPage: jest.fn().mockResolvedValue({ page: 1, readable: true, matches: [], unmatchedCount: 0 }),
      startPdf: jest.fn().mockResolvedValue({ id: 'lf1' }),
      findOne: jest.fn(),
      findActive: jest.fn(),
      markAdded: jest.fn(),
      markPushOpened: jest.fn().mockResolvedValue(undefined),
    };
    budget = { get: jest.fn().mockResolvedValue({ used: 1, limit: 20, resetAt: 'x' }) };
    controller = new LeafletsController(service, budget);
  });
  afterAll(() => {
    process.env.ADMIN_EMAILS = OLD;
  });

  it('is guarded by JwtAuthGuard then AccountContextGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, LeafletsController)).toEqual([JwtAuthGuard, AccountContextGuard]);
  });

  it('passes the guard account and a non-admin flag', async () => {
    await controller.readPage(req(), 'lf1', { imageBase64: 'abc' });
    expect(service.readPage).toHaveBeenCalledWith('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, false);
  });

  it('flags an ADMIN_EMAILS user (case-insensitive) so the budget is skipped', async () => {
    await controller.readPage(req('boss@example.com'), 'lf1', { imageBase64: 'abc' });
    expect(service.readPage).toHaveBeenCalledWith('acc1', 'u1', 'lf1', { imageBase64: 'abc' }, true);
    await controller.uploadPdf(req('BOSS@example.com'), 'lf1', { pdfBase64: 'JVBERg==' });
    expect(service.startPdf).toHaveBeenCalledWith('acc1', 'u1', 'lf1', { pdfBase64: 'JVBERg==' }, true);
  });

  it('rejects a malformed body with 400', async () => {
    await expect(controller.create(req(), { source: 'nope' })).rejects.toMatchObject({ status: 400 });
    await expect(controller.readPage(req(), 'lf1', {})).rejects.toMatchObject({ status: 400 });
    await expect(controller.uploadPdf(req(), 'lf1', { pdfBase64: '' })).rejects.toMatchObject({ status: 400 });
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates with the validated body', async () => {
    await expect(controller.create(req(), { source: 'share', platform: 'android' })).resolves.toEqual({ id: 'lf1' });
    expect(service.create).toHaveBeenCalledWith('acc1', 'u1', { source: 'share', platform: 'android' });
  });

  it('reads the budget of the calling user', async () => {
    await controller.budget(req());
    expect(budget.get).toHaveBeenCalledWith('u1');
  });

  it('declares GET budget before GET :id so ":id" cannot capture it', () => {
    const names = Object.getOwnPropertyNames(LeafletsController.prototype);
    expect(names.indexOf('budget')).toBeLessThan(names.indexOf('findOne'));
  });
  it('POST push-opened is declared before any :id route and answers 204', () => {
    const names = Object.getOwnPropertyNames(LeafletsController.prototype);
    const at = names.indexOf('markPushOpened');
    expect(at).toBeGreaterThan(-1);
    for (const r of ['findOne', 'readPage', 'uploadPdf']) expect(at).toBeLessThan(names.indexOf(r));
    expect(Reflect.getMetadata('__httpCode__', LeafletsController.prototype.markPushOpened)).toBe(204);
  });

  it('push-opened is scoped to the caller and validates the key', async () => {
    const key = '3f1c1d3e-8f1a-4c55-9d0e-5c1b2a3d4e5f';
    await controller.markPushOpened(req(), { pushKey: key });
    expect(service.markPushOpened).toHaveBeenCalledWith('u1', key);
    await expect(controller.markPushOpened(req(), { pushKey: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(controller.markPushOpened(req(), {})).rejects.toMatchObject({ status: 400 });
  });
});

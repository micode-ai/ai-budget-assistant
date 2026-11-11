import { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { LeafletsAdminController } from './leaflets-admin.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';

function ctx(email: string | undefined): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ user: email ? { id: 'u1', email } : undefined }) }) } as any;
}

const req = (id = 'admin-1') => ({ user: { id, email: 'boss@example.com' } }) as any;

describe('LeafletsAdminController', () => {
  const OLD = process.env.ADMIN_EMAILS;
  let service: Record<string, jest.Mock>;
  let controller: LeafletsAdminController;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'Boss@Example.com';
    service = {
      upload: jest.fn().mockResolvedValue({ id: 'lf1' }),
      list: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'lf1' }),
      updateLeaflet: jest.fn().mockResolvedValue({ id: 'lf1' }),
      updateItem: jest.fn().mockResolvedValue({ id: 'it1' }),
      deleteItem: jest.fn().mockResolvedValue(undefined),
      recipients: jest.fn().mockResolvedValue({ users: 3 }),
      publish: jest.fn().mockResolvedValue({ id: 'lf1' }),
      unpublish: jest.fn().mockResolvedValue({ id: 'lf1' }),
      stats: jest.fn().mockResolvedValue({}),
    };
    controller = new LeafletsAdminController(service as any);
  });
  afterAll(() => {
    process.env.ADMIN_EMAILS = OLD;
  });

  it('is guarded by JwtAuthGuard then AdminGuard, never AccountContextGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, LeafletsAdminController)).toEqual([JwtAuthGuard, AdminGuard]);
    expect(Reflect.getMetadata(PATH_METADATA, LeafletsAdminController)).toBe('admin/leaflets');
  });

  it('non-admin → 403 (AdminGuard)', () => {
    const guard = new AdminGuard();
    expect(() => guard.canActivate(ctx('someone@example.com'))).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => guard.canActivate(ctx(undefined))).toThrow(expect.objectContaining({ status: 403 }));
    expect(guard.canActivate(ctx('BOSS@example.com'))).toBe(true);
  });

  it('declares stats before :id so the static segment is not captured', () => {
    const proto = LeafletsAdminController.prototype;
    const getRoutes = Object.getOwnPropertyNames(proto)
      .filter((k) => Reflect.getMetadata(METHOD_METADATA, (proto as any)[k]) === RequestMethod.GET)
      .map((k) => Reflect.getMetadata(PATH_METADATA, (proto as any)[k]));
    expect(getRoutes.indexOf('stats')).toBeGreaterThanOrEqual(0);
    expect(getRoutes.indexOf('stats')).toBeLessThan(getRoutes.indexOf(':id'));
  });

  it('upload passes the admin user id and the files', async () => {
    const files = [{ buffer: Buffer.from('x'), mimetype: 'image/png', size: 1 }] as any;
    await expect(controller.upload(req(), files)).resolves.toEqual({ id: 'lf1' });
    expect(service.upload).toHaveBeenCalledWith('admin-1', files);
    await controller.upload(req(), undefined as any);
    expect(service.upload).toHaveBeenLastCalledWith('admin-1', []);
  });

  it('validates PATCH bodies with 400', async () => {
    await expect(controller.updateLeaflet('lf1', { validTo: '16.11.2026' })).rejects.toMatchObject({ status: 400 });
    await expect(controller.updateItem('lf1', 'it1', { promoPrice: -1 })).rejects.toMatchObject({ status: 400 });
    await expect(controller.updateItem('lf1', 'it1', { promoPrice: 'x' })).rejects.toMatchObject({ status: 400 });
    expect(service.updateLeaflet).not.toHaveBeenCalled();
    expect(service.updateItem).not.toHaveBeenCalled();

    await controller.updateLeaflet('lf1', { chain: 'Lidl', validFrom: '2026-11-10', validTo: null });
    expect(service.updateLeaflet).toHaveBeenCalledWith('lf1', { chain: 'Lidl', validFrom: '2026-11-10', validTo: null });
    await controller.updateItem('lf1', 'it1', { promoPrice: 3.99, regularPrice: null, condition: null });
    expect(service.updateItem).toHaveBeenCalledWith('lf1', 'it1', { promoPrice: 3.99, regularPrice: null, condition: null });
  });

  it('publish passes the admin user id; stats parses days', async () => {
    await controller.publish(req('admin-9'), 'lf1');
    expect(service.publish).toHaveBeenCalledWith('lf1', 'admin-9');
    await controller.stats('7');
    expect(service.stats).toHaveBeenCalledWith(7);
    await controller.stats(undefined);
    expect(service.stats).toHaveBeenLastCalledWith(30);
  });
});

import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';

function makeController(update = jest.fn()) {
  const usersService = {
    update,
    findById: jest.fn(),
    updateLastSync: jest.fn().mockResolvedValue(null),
  } as any;
  const controller = new UsersController(
    usersService,
    {} as any, // telegramLinkService
    {} as any, // telegramBotService
    {} as any, // whatsAppLinkService
    {} as any, // slackLinkService
  );
  return { controller, usersService, update };
}

const req = { user: { id: 'u1' } } as any;

describe('UsersController.updateProfile theme prefs', () => {
  it('rejects an invalid accentColor', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { accentColor: 'red' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid themeMode', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { themeMode: 'blue' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid themeMode + accentColor and returns them', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'dark', accentColor: '#AABBCC',
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { themeMode: 'dark', accentColor: '#AABBCC' });
    expect(update).toHaveBeenCalledWith('u1', { themeMode: 'dark', accentColor: '#AABBCC' });
    expect(res.themeMode).toBe('dark');
    expect(res.accentColor).toBe('#AABBCC');
  });

  it('accepts accentColor null (reset to default)', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'system', accentColor: null,
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { accentColor: null });
    expect(update).toHaveBeenCalledWith('u1', { accentColor: null });
    expect(res.accentColor).toBeNull();
  });
});

describe('UsersController.updateProfile payment handle', () => {
  it('rejects an invalid paymentMethod', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { paymentMethod: 'venmo' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a malformed paymentHandle (disallowed characters)', async () => {
    const { controller } = makeController();
    await expect(
      controller.updateProfile(req, { paymentHandle: '<script>alert(1)</script>' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a valid paymentMethod + paymentHandle (BLIK phone number with + and space) and returns them', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'system', accentColor: null,
      paymentMethod: 'blik', paymentHandle: '+48 123 456 789',
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { paymentMethod: 'blik', paymentHandle: '+48 123 456 789' });
    expect(update).toHaveBeenCalledWith('u1', { paymentMethod: 'blik', paymentHandle: '+48 123 456 789' });
    expect(res.paymentMethod).toBe('blik');
    expect(res.paymentHandle).toBe('+48 123 456 789');
  });

  it('clears paymentMethod and paymentHandle via explicit null', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'system', accentColor: null,
      paymentMethod: null, paymentHandle: null,
    });
    const { controller } = makeController(update);
    const res = await controller.updateProfile(req, { paymentMethod: null, paymentHandle: null });
    expect(update).toHaveBeenCalledWith('u1', { paymentMethod: null, paymentHandle: null });
    expect(res.paymentMethod).toBeNull();
    expect(res.paymentHandle).toBeNull();
  });

  it('leaves paymentMethod/paymentHandle untouched when absent from the body (distinct from explicit null)', async () => {
    const update = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      contributeCommunityPrices: false, themeMode: 'system', accentColor: null,
      paymentMethod: 'revolut', paymentHandle: '@existing-handle',
    });
    const { controller } = makeController(update);
    // body has no paymentMethod/paymentHandle keys at all — must not be forwarded as null
    await controller.updateProfile(req, { name: 'New Name' });
    expect(update).toHaveBeenCalledWith('u1', { name: 'New Name' });
    const forwarded = update.mock.calls[0][1];
    expect(forwarded).not.toHaveProperty('paymentMethod');
    expect(forwarded).not.toHaveProperty('paymentHandle');
  });
});

describe('UsersController.getProfile payment handle', () => {
  it('returns the stored paymentMethod/paymentHandle', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      aiResponseMode: 'balanced', aiModel: 'balanced', contributeCommunityPrices: false,
      themeMode: 'system', accentColor: null, createdAt: new Date('2026-01-01'),
      paymentMethod: 'paypal', paymentHandle: 'user@paypal.com',
    });
    const usersService = { findById, updateLastSync: jest.fn().mockResolvedValue(null) } as any;
    const controller = new UsersController(usersService, {} as any, {} as any, {} as any, {} as any);
    const res = await controller.getProfile(req);
    expect(res.paymentMethod).toBe('paypal');
    expect(res.paymentHandle).toBe('user@paypal.com');
  });

  it('returns null paymentMethod/paymentHandle when never set', async () => {
    const findById = jest.fn().mockResolvedValue({
      id: 'u1', email: 'a@b.c', name: 'A', currencyCode: 'USD', timezone: 'UTC',
      aiResponseMode: 'balanced', aiModel: 'balanced', contributeCommunityPrices: false,
      themeMode: 'system', accentColor: null, createdAt: new Date('2026-01-01'),
      paymentMethod: null, paymentHandle: null,
    });
    const usersService = { findById, updateLastSync: jest.fn().mockResolvedValue(null) } as any;
    const controller = new UsersController(usersService, {} as any, {} as any, {} as any, {} as any);
    const res = await controller.getProfile(req);
    expect(res.paymentMethod).toBeNull();
    expect(res.paymentHandle).toBeNull();
  });
});

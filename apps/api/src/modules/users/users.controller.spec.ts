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

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppVersionsService } from './app-versions.service';

function makePrismaMock() {
  return {
    appVersion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('AppVersionsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AppVersionsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AppVersionsService(prisma as any);
  });

  describe('check', () => {
    it('returns up-to-date when no row exists for the platform', async () => {
      prisma.appVersion.findFirst.mockResolvedValue(null);
      const r = await service.check('android', '1.0.0');
      expect(r.isUpdateAvailable).toBe(false);
      expect(r.isUpdateRequired).toBe(false);
      expect(r.latestVersion).toBe('1.0.0');
      expect(r.releaseNotes).toBeNull();
      expect(r.storeUrl).toMatch(/play\.google\.com/);
    });

    it('flags update available when client version < latest', async () => {
      prisma.appVersion.findFirst.mockResolvedValue({
        latestVersion: '1.2.0',
        minSupportedVersion: '1.0.0',
        releaseNotes: { en: 'Bug fixes' },
        storeUrl: 'https://example.com',
      });
      const r = await service.check('android', '1.1.0');
      expect(r.isUpdateAvailable).toBe(true);
      expect(r.isUpdateRequired).toBe(false);
    });

    it('flags update required when client version < min', async () => {
      prisma.appVersion.findFirst.mockResolvedValue({
        latestVersion: '2.0.0',
        minSupportedVersion: '1.5.0',
        releaseNotes: null,
        storeUrl: 'https://example.com',
      });
      const r = await service.check('android', '1.0.0');
      expect(r.isUpdateAvailable).toBe(true);
      expect(r.isUpdateRequired).toBe(true);
    });

    it('returns up-to-date when client version equals latest', async () => {
      prisma.appVersion.findFirst.mockResolvedValue({
        latestVersion: '1.0.0',
        minSupportedVersion: '1.0.0',
        releaseNotes: null,
        storeUrl: 'https://example.com',
      });
      const r = await service.check('android', '1.0.0');
      expect(r.isUpdateAvailable).toBe(false);
      expect(r.isUpdateRequired).toBe(false);
    });
  });

  describe('create', () => {
    it('rejects when latestVersion < minSupportedVersion', async () => {
      await expect(
        service.create({
          platform: 'android',
          latestVersion: '1.0.0',
          minSupportedVersion: '1.5.0',
          storeUrl: 'https://example.com',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.appVersion.create).not.toHaveBeenCalled();
    });

    it('persists when latest >= min', async () => {
      prisma.appVersion.create.mockResolvedValue({ id: 'cuid1' });
      await service.create({
        platform: 'android',
        latestVersion: '1.2.0',
        minSupportedVersion: '1.0.0',
        storeUrl: 'https://example.com',
      });
      expect(prisma.appVersion.create).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFound when row does not exist', async () => {
      prisma.appVersion.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});

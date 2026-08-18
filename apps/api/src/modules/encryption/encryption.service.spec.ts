import { HttpException, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';
import { EncryptionService, recoveryRateLimitKey } from './encryption.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// The recovery rate limit is a brute-force guard on restoring a user's E2EE
// keys, now backed by CacheService.incrementWindow instead of an in-memory
// Map (which reset on every deploy — see tech-debt
// encryption-service-recovery-rate-limit-in-memory-map).
describe('EncryptionService.recover — rate limiting', () => {
  let prisma: any;
  let cache: any;
  let service: EncryptionService;

  const profile = {
    pbkdf2Salt: 'salt',
    publicKeyX25519: 'pubX',
    publicKeyEd25519: 'pubEd',
    wrappedPrivateKeyX25519: 'wrapX',
    wrappedPrivateKeyEd25519: 'wrapEd',
    wrappedMasterKeyByRecovery: 'wrapMaster',
    recoveryKeyHash: 'hashed',
    keyVersion: 3,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      userEncryptionProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
    };
    cache = { incrementWindow: jest.fn() };
    service = new EncryptionService(prisma, cache);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  it('uses a per-email Redis key with a 15-minute window', async () => {
    cache.incrementWindow.mockResolvedValue(1);

    await service.recover({ email: 'a@x.com', recoveryKey: 'k' });

    expect(cache.incrementWindow).toHaveBeenCalledWith(recoveryRateLimitKey('a@x.com'), 15 * 60 * 1000);
  });

  it('allows exactly 5 attempts within the window', async () => {
    for (let hit = 1; hit <= 5; hit++) {
      cache.incrementWindow.mockResolvedValueOnce(hit);
      await expect(service.recover({ email: 'a@x.com', recoveryKey: 'k' })).resolves.toBeDefined();
    }
  });

  it('rejects the 6th attempt within the window with 429', async () => {
    cache.incrementWindow.mockResolvedValueOnce(6);

    await expect(service.recover({ email: 'a@x.com', recoveryKey: 'k' })).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('fails closed (denies) when Redis is unreachable — never silently unlimited', async () => {
    cache.incrementWindow.mockRejectedValueOnce(new Error('connection lost'));

    await expect(service.recover({ email: 'a@x.com', recoveryKey: 'k' })).rejects.toBeInstanceOf(HttpException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('still validates the recovery key and 404s an unknown user once past the rate limit', async () => {
    cache.incrementWindow.mockResolvedValue(1);
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.recover({ email: 'nobody@x.com', recoveryKey: 'k' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an invalid recovery key with 400', async () => {
    cache.incrementWindow.mockResolvedValue(1);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.recover({ email: 'a@x.com', recoveryKey: 'wrong' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

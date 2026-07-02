import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { TripArchivedGuard } from './trip-archived.guard';
import { PrismaService } from '../../../database/prisma.service';

describe('TripArchivedGuard', () => {
  function mockContext(accountId: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ accountId, method: 'POST' }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows the request when the account is not archived', async () => {
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ tripStatus: 'active' }) },
    } as unknown as PrismaService;
    const guard = new TripArchivedGuard(prisma);
    await expect(guard.canActivate(mockContext('acc-1'))).resolves.toBe(true);
  });

  it('throws ForbiddenException when the account is archived', async () => {
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ tripStatus: 'archived' }) },
    } as unknown as PrismaService;
    const guard = new TripArchivedGuard(prisma);
    await expect(guard.canActivate(mockContext('acc-1'))).rejects.toThrow(ForbiddenException);
  });

  it('allows non-trip accounts (tripStatus is null)', async () => {
    const prisma = {
      account: { findUnique: jest.fn().mockResolvedValue({ tripStatus: null }) },
    } as unknown as PrismaService;
    const guard = new TripArchivedGuard(prisma);
    await expect(guard.canActivate(mockContext('acc-1'))).resolves.toBe(true);
  });
});

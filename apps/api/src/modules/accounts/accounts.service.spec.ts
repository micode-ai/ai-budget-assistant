import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAccountDto, UpdateAccountDto } from './dto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  account: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  accountMember: {
    create: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  },
  accountInvitation: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  category: {
    createMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  settleUpTransaction: {
    count: jest.fn(),
  },
  oAuthGrantAccount: { findMany: jest.fn(), deleteMany: jest.fn() },
  oAuthGrant: { findMany: jest.fn(), updateMany: jest.fn() },
  oAuthToken: { deleteMany: jest.fn() },
  $transaction: jest.fn((fn: (tx: any) => any) => fn(mockPrisma)),
};

const mockMailService = {
  sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
};

const mockNotificationsService = {
  sendToUser: jest.fn().mockResolvedValue(true),
};

describe('AccountsService', () => {
  let service: AccountsService;
  const userId = 'user-1';

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMailService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get(AccountsService);

    jest.clearAllMocks();
    mockPrisma.account.findFirst.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.account.create.mockImplementation(({ data }: any) => ({
      id: 'account-1',
      ...data,
    }));
    mockPrisma.accountMember.create.mockResolvedValue({ id: 'member-1' });
    mockPrisma.user.findUnique.mockResolvedValue({ language: 'en' });
    mockPrisma.category.createMany.mockResolvedValue({ count: 17 });
  });

  describe('create — trip accounts', () => {
    it('throws BadRequestException when type is trip and tripEndDate is missing', async () => {
      await expect(
        service.create(userId, { name: 'Bali trip', type: 'trip' } as CreateAccountDto),
      ).rejects.toThrow('tripEndDate is required for trip accounts');
    });

    it('defaults tripStartDate to today and sets tripStatus to active', async () => {
      const account = await service.create(userId, {
        name: 'Bali trip',
        type: 'trip',
        tripEndDate: '2026-08-10',
      } as CreateAccountDto);

      expect(account.tripStatus).toBe('active');
      expect(account.tripStartDate).toBeDefined();
    });
  });

  describe('create — default category seeding', () => {
    it.each(['personal', 'business', 'shared', 'trip'] as const)(
      'seeds the localized default categories for a new %s account',
      async (type) => {
        mockPrisma.user.findUnique.mockResolvedValue({ language: 'pl' });

        const dto = {
          name: 'Account',
          type,
          ...(type === 'trip' ? { tripEndDate: '2026-08-10' } : {}),
        } as CreateAccountDto;

        await service.create(userId, dto);

        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: userId },
          select: { language: true },
        });
        expect(mockPrisma.category.createMany).toHaveBeenCalledTimes(1);
        const call = mockPrisma.category.createMany.mock.calls[0][0];
        expect(call.data.length).toBeGreaterThan(0);
        expect(call.data.every((c: { accountId: string }) => c.accountId === 'account-1')).toBe(true);
        // Spot-check localization actually took effect (Polish, not English)
        expect(call.data.some((c: { name: string }) => c.name === 'Zakupy spożywcze')).toBe(true);
      },
    );

    it('seeds Salary and Freelance as income categories and everything else as expense', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ language: 'en' });
      await service.create(userId, { name: 'Family', type: 'shared' } as CreateAccountDto);

      const data: Array<{ name: string; type: string }> = mockPrisma.category.createMany.mock.calls[0][0].data;
      const typeOf = (name: string) => data.find((c) => c.name === name)?.type;
      expect(typeOf('Salary')).toBe('income');
      expect(typeOf('Freelance')).toBe('income');
      expect(typeOf('Groceries')).toBe('expense');
      expect(data.filter((c) => c.type === 'income')).toHaveLength(2);
    });

    it('seeds every row with its catalog key', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ language: 'pl' });
      await service.create(userId, { name: 'Family', type: 'shared' } as CreateAccountDto);
      const data: Array<{ name: string; type: string; systemKey: string | null }> =
        mockPrisma.category.createMany.mock.calls[0][0].data;
      expect(data.find((c) => c.name === 'Zakupy spożywcze')?.systemKey).toBe('groceries');
      expect(data.every((c) => c.systemKey)).toBe(true);
    });

    it('does NOT seed categories for an investment account', async () => {
      await service.create(userId, { name: 'Portfolio', type: 'investment' } as CreateAccountDto);

      expect(mockPrisma.category.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to English defaults when the user has no language set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ language: null });

      await service.create(userId, { name: 'Personal 2', type: 'personal' } as CreateAccountDto);

      const call = mockPrisma.category.createMany.mock.calls[0][0];
      expect(call.data.some((c: { name: string }) => c.name === 'Groceries')).toBe(true);
    });
  });

  describe('remove — connected apps', () => {
    it('soft-deletes the account and drops it from OAuth grants in the same transaction', async () => {
      mockPrisma.accountMember.findUnique.mockResolvedValue({ role: 'owner' });
      mockPrisma.user.findUnique.mockResolvedValue({ defaultAccountId: 'other' });
      mockPrisma.account.update.mockResolvedValue({});
      mockPrisma.oAuthGrantAccount.findMany.mockResolvedValue([{ grantId: 'g1' }]);
      mockPrisma.oAuthGrantAccount.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.oAuthGrant.findMany.mockResolvedValue([{ id: 'g1' }]);
      mockPrisma.oAuthToken.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });

      await service.remove('account-1', userId);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.account.update).toHaveBeenCalledWith({ where: { id: 'account-1' }, data: { isActive: false } });
      expect(mockPrisma.oAuthGrantAccount.deleteMany).toHaveBeenCalledWith({ where: { accountId: 'account-1' } });
      expect(mockPrisma.oAuthGrant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date), revokedBy: 'user' } }),
      );
    });
  });

  describe('archiveTrip', () => {
    it('throws ForbiddenException when the caller is not the account owner', async () => {
      mockPrisma.account.findFirst.mockResolvedValue(null);

      await expect(service.archiveTrip('acc-1', userId)).rejects.toThrow(
        'Only the trip owner can archive it',
      );
      expect(mockPrisma.account.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when there are unconfirmed settle-up transactions and force is not set', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', ownerId: userId });
      mockPrisma.settleUpTransaction.count.mockResolvedValue(2);

      await expect(service.archiveTrip('acc-1', userId)).rejects.toThrow(
        'There are unconfirmed settle-up transactions — pass force to archive anyway',
      );
      expect(mockPrisma.account.update).not.toHaveBeenCalled();
    });

    it('archives the trip when all settle-up transactions are confirmed', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', ownerId: userId });
      mockPrisma.settleUpTransaction.count.mockResolvedValue(0);
      mockPrisma.account.update.mockResolvedValue({ id: 'acc-1', tripStatus: 'archived' });

      const result = await service.archiveTrip('acc-1', userId);

      expect(result.tripStatus).toBe('archived');
      expect(mockPrisma.settleUpTransaction.count).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', status: 'pending' },
      });
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        data: { tripStatus: 'archived' },
      });
    });

    it('skips the unconfirmed-transaction check when force is true', async () => {
      mockPrisma.account.findFirst.mockResolvedValue({ id: 'acc-1', ownerId: userId });
      mockPrisma.account.update.mockResolvedValue({ id: 'acc-1', tripStatus: 'archived' });

      const result = await service.archiveTrip('acc-1', userId, true);

      expect(result.tripStatus).toBe('archived');
      expect(mockPrisma.settleUpTransaction.count).not.toHaveBeenCalled();
    });
  });
});

describe('UpdateAccountDto.monthAnchorDay', () => {
  const check = async (value: unknown) => {
    const dto = plainToInstance(UpdateAccountDto, { monthAnchorDay: value });
    return validate(dto);
  };

  it('accepts 1, 10 and 31', async () => {
    expect(await check(1)).toHaveLength(0);
    expect(await check(10)).toHaveLength(0);
    expect(await check(31)).toHaveLength(0);
  });

  it('accepts null to reset to the calendar month', async () => {
    expect(await check(null)).toHaveLength(0);
  });

  it('rejects 0, 32 and non-integers', async () => {
    expect((await check(0)).length).toBeGreaterThan(0);
    expect((await check(32)).length).toBeGreaterThan(0);
    expect((await check(10.5)).length).toBeGreaterThan(0);
  });
});

// The semantic heart of "reset to calendar month": AccountsService.update()
// forwards `dto.monthAnchorDay` straight into the Prisma `data` payload
// (accounts.service.ts, no field-by-field truthy filtering). A well-meaning
// tidy-up that swapped that passthrough for a `if (dto.monthAnchorDay) ...`
// guard would silently treat an explicit `null` as "field not sent" --
// undefined is a Prisma no-op (anchor preserved), null clears the column --
// and every other test in this file would stay green. These two assert the
// actual `data` payload reaching Prisma, not just the DTO's own validation.
describe('AccountsService.update — monthAnchorDay Prisma payload', () => {
  let service: AccountsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMailService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();
    service = module.get(AccountsService);

    jest.clearAllMocks();
    mockPrisma.accountMember.findUnique.mockResolvedValue({
      accountId: 'account-1',
      userId: 'user-1',
      role: 'owner',
    });
    mockPrisma.account.update.mockResolvedValue({ id: 'account-1' });
  });

  it('omitting monthAnchorDay from the DTO sends undefined -- a Prisma no-op that preserves the existing anchor', async () => {
    const dto = plainToInstance(UpdateAccountDto, { name: 'Renamed account' });
    expect(dto.monthAnchorDay).toBeUndefined();

    await service.update('account-1', 'user-1', dto);

    expect(mockPrisma.account.update).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.account.update.mock.calls[0][0];
    expect(data.monthAnchorDay).toBeUndefined();
  });

  it('an explicit null in the DTO sends data.monthAnchorDay === null -- clears the anchor back to the calendar month', async () => {
    const dto = plainToInstance(UpdateAccountDto, { monthAnchorDay: null });
    expect(dto.monthAnchorDay).toBeNull();

    await service.update('account-1', 'user-1', dto);

    expect(mockPrisma.account.update).toHaveBeenCalledTimes(1);
    const { data } = mockPrisma.account.update.mock.calls[0][0];
    expect(data.monthAnchorDay).toBeNull();
  });
});

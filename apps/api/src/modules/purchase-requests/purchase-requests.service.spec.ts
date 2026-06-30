import { Test } from '@nestjs/testing';
import { PurchaseRequestsService } from './purchase-requests.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma: any = {
  purchaseRequest: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  purchaseRequestVote: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  accountMember: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  expense: {
    create: jest.fn(),
    update: jest.fn(),
  },
  account: {
    update: jest.fn(),
  },
  $transaction: jest.fn((fn: (tx: any) => any) => fn(mockPrisma)),
};

const mockNotifications = { sendToUser: jest.fn().mockResolvedValue(true) };

describe('PurchaseRequestsService', () => {
  let service: PurchaseRequestsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PurchaseRequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(PurchaseRequestsService);
    jest.clearAllMocks();
  });

  describe('evaluateApproval — MAJORITY', () => {
    it('approves when >50% approve (3 of 5, 0 abstain)', async () => {
      const votes = [
        { vote: 'APPROVE', userId: 'u1' },
        { vote: 'APPROVE', userId: 'u2' },
        { vote: 'APPROVE', userId: 'u3' },
      ];
      mockPrisma.accountMember.count.mockResolvedValue(5);
      const result = (service as any).computeDecision('MAJORITY', votes, 5);
      expect(result).toBe('APPROVED');
    });

    it('rejects when >50% reject', async () => {
      const votes = [
        { vote: 'REJECT', userId: 'u1' },
        { vote: 'REJECT', userId: 'u2' },
        { vote: 'REJECT', userId: 'u3' },
      ];
      const result = (service as any).computeDecision('MAJORITY', votes, 5);
      expect(result).toBe('REJECTED');
    });

    it('returns null when no majority yet', () => {
      const votes = [{ vote: 'APPROVE', userId: 'u1' }, { vote: 'REJECT', userId: 'u2' }];
      const result = (service as any).computeDecision('MAJORITY', votes, 5);
      expect(result).toBeNull();
    });

    it('excludes ABSTAIN from denominator', () => {
      // 2 approve, 1 abstain, 2 total effective (denominator = 5 - 1 = 4? No:
      // ABSTAIN excluded from denominator means: 2 approve out of (5 - 1 abstain) = 4 effective
      // 2/4 = 50%, NOT > 50%, so still pending
      const votes = [
        { vote: 'APPROVE', userId: 'u1' },
        { vote: 'APPROVE', userId: 'u2' },
        { vote: 'ABSTAIN', userId: 'u3' },
      ];
      // 2 approve / (5 - 1 abstain) = 2/4 = 0.5, not > 0.5
      const result = (service as any).computeDecision('MAJORITY', votes, 5);
      expect(result).toBeNull();
    });
  });

  describe('evaluateApproval — UNANIMOUS', () => {
    it('approves when all non-abstain votes are APPROVE', () => {
      const votes = [
        { vote: 'APPROVE', userId: 'u1' },
        { vote: 'APPROVE', userId: 'u2' },
        { vote: 'ABSTAIN', userId: 'u3' },
      ];
      // effectiveTotal = 5 - 1 = 4, approveCount 2 !== 4 → still pending
      // Wait: only 3 have voted (2 approve + 1 abstain). effectiveTotal = totalMembers - abstainCount = 5 - 1 = 4
      // approveCount (2) !== effectiveTotal (4) → null
      const result = (service as any).computeDecision('UNANIMOUS', votes, 5);
      expect(result).toBeNull();
    });

    it('approves when all 3 members approve (no abstain)', () => {
      const votes = [
        { vote: 'APPROVE', userId: 'u1' },
        { vote: 'APPROVE', userId: 'u2' },
        { vote: 'APPROVE', userId: 'u3' },
      ];
      // effectiveTotal = 3 - 0 = 3, approveCount 3 === 3 → APPROVED
      const result = (service as any).computeDecision('UNANIMOUS', votes, 3);
      expect(result).toBe('APPROVED');
    });

    it('rejects immediately on any REJECT', () => {
      const votes = [{ vote: 'REJECT', userId: 'u1' }];
      const result = (service as any).computeDecision('UNANIMOUS', votes, 5);
      expect(result).toBe('REJECTED');
    });
  });

  describe('evaluateApproval — OWNER_ONLY', () => {
    const members = [
      { userId: 'owner1', role: 'owner' },
      { userId: 'editor1', role: 'editor' },
    ];

    it('approves when owner votes APPROVE', () => {
      const votes = [{ vote: 'APPROVE', userId: 'owner1' }];
      const result = (service as any).computeDecisionOwnerOnly(votes, members);
      expect(result).toBe('APPROVED');
    });

    it('rejects when owner votes REJECT', () => {
      const votes = [{ vote: 'REJECT', userId: 'owner1' }];
      const result = (service as any).computeDecisionOwnerOnly(votes, members);
      expect(result).toBe('REJECTED');
    });

    it('returns null when non-owner votes', () => {
      const votes = [{ vote: 'APPROVE', userId: 'editor1' }];
      const result = (service as any).computeDecisionOwnerOnly(votes, members);
      expect(result).toBeNull();
    });
  });

  describe('convert', () => {
    it('throws BadRequestException if status is not APPROVED', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', status: 'PENDING', plannedExpenseId: null,
        amount: 100, currency: 'PLN', title: 'Test',
      });
      await expect(service.convert('pr1', 'acc1', 'user1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if already converted', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', status: 'APPROVED', plannedExpenseId: 'exp1',
        amount: 100, currency: 'PLN', title: 'Test',
      });
      await expect(service.convert('pr1', 'acc1', 'user1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('allows creator to cancel their own request', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', createdByUserId: 'user1', status: 'PENDING',
      });
      mockPrisma.purchaseRequest.update.mockResolvedValue({});
      await expect(service.cancel('pr1', 'acc1', 'user1', 'editor')).resolves.not.toThrow();
    });

    it('allows owner to cancel any request', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', createdByUserId: 'other', status: 'PENDING',
      });
      mockPrisma.purchaseRequest.update.mockResolvedValue({});
      await expect(service.cancel('pr1', 'acc1', 'user1', 'owner')).resolves.not.toThrow();
    });

    it('throws ForbiddenException if non-creator non-owner tries to cancel', async () => {
      mockPrisma.purchaseRequest.findFirst.mockResolvedValue({
        id: 'pr1', accountId: 'acc1', createdByUserId: 'someone-else', status: 'PENDING',
      });
      await expect(service.cancel('pr1', 'acc1', 'user1', 'editor')).rejects.toThrow(ForbiddenException);
    });
  });
});

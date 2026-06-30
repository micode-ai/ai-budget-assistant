import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { FamilyFeedService } from './family-feed.service';
import { PrismaService } from '../../database/prisma.service';

type RawEvent = {
  id: string;
  userId: string;
  type: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  user: { name: string };
  reactions: { emoji: string; userId: string }[];
};

const makeEvent = (overrides: Partial<RawEvent> = {}): RawEvent => ({
  id: 'e1',
  userId: 'u1',
  type: 'EXPENSE_ADDED',
  entityId: 'exp1',
  metadata: { amount: 100, currency: 'PLN' },
  createdAt: new Date('2026-01-15T10:00:00Z'),
  user: { name: 'Alice' },
  reactions: [],
  ...overrides,
});

describe('FamilyFeedService', () => {
  let service: FamilyFeedService;
  let prisma: {
    account: { findUnique: jest.Mock };
    familyFeedEvent: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock };
    feedReaction: { upsert: jest.Mock; deleteMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      account: { findUnique: jest.fn() },
      familyFeedEvent: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
      feedReaction: { upsert: jest.fn(), deleteMany: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [
        FamilyFeedService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(FamilyFeedService);
  });

  // ── groupEvents ──────────────────────────────────────────────────────

  describe('groupEvents', () => {
    it('groups two expenses from same user on same UTC day into one card', () => {
      const events = [
        makeEvent({ id: 'e1', entityId: 'exp1', metadata: { amount: 50, currency: 'PLN' }, createdAt: new Date('2026-01-15T10:00:00Z') }),
        makeEvent({ id: 'e2', entityId: 'exp2', metadata: { amount: 70, currency: 'PLN' }, createdAt: new Date('2026-01-15T14:00:00Z') }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(1);
      expect(groups[0].type).toBe('expenses');
      expect(groups[0].count).toBe(2);
      expect(groups[0].totalAmount).toBe(120);
      expect(groups[0].eventIds).toEqual(['exp1', 'exp2']);
    });

    it('creates two groups for same user on different days', () => {
      const events = [
        makeEvent({ id: 'e1', createdAt: new Date('2026-01-15T10:00:00Z') }),
        makeEvent({ id: 'e2', createdAt: new Date('2026-01-16T10:00:00Z') }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(2);
    });

    it('creates two groups for different users on same day', () => {
      const events = [
        makeEvent({ id: 'e1', userId: 'u1' }),
        makeEvent({ id: 'e2', userId: 'u2', user: { name: 'Bob' } }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(2);
    });

    it('never groups purchase request events — each is its own card', () => {
      const events = [
        makeEvent({ id: 'e1', type: 'PURCHASE_REQUEST_CREATED', entityId: 'pr1', metadata: { amount: 450, currency: 'PLN', title: 'Nike' } }),
        makeEvent({ id: 'e2', type: 'PURCHASE_REQUEST_CREATED', entityId: 'pr2', metadata: { amount: 200, currency: 'PLN', title: 'Adidas' } }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(2);
      expect(groups[0].type).toBe('purchase_request_created');
      expect(groups[0].purchaseRequest?.title).toBe('Nike');
    });

    it('sets myReaction to caller emoji when present', () => {
      const events = [
        makeEvent({ reactions: [{ emoji: '👍', userId: 'u1' }, { emoji: '❤️', userId: 'u2' }] }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups[0].myReaction).toBe('👍');
    });

    it('sets myReaction to null when caller has no reaction', () => {
      const events = [makeEvent({ reactions: [{ emoji: '👍', userId: 'u2' }] })];
      const groups = service.groupEvents(events, 'u1');
      expect(groups[0].myReaction).toBeNull();
    });

    it('separates expenses and incomes into different group types', () => {
      const events = [
        makeEvent({ id: 'e1', type: 'EXPENSE_ADDED' }),
        makeEvent({ id: 'e2', type: 'INCOME_ADDED' }),
      ];
      const groups = service.groupEvents(events, 'u1');
      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.type).sort()).toEqual(['expenses', 'incomes']);
    });
  });

  // ── recordEvent ──────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('does not create event for personal account', async () => {
      prisma.account.findUnique.mockResolvedValue({ type: 'personal' });
      await service.recordEvent('acc1', 'u1', 'EXPENSE_ADDED', 'exp1', { amount: 50, currency: 'PLN' });
      expect(prisma.familyFeedEvent.create).not.toHaveBeenCalled();
    });

    it('creates event for shared account', async () => {
      prisma.account.findUnique.mockResolvedValue({ type: 'shared' });
      prisma.familyFeedEvent.create.mockResolvedValue({});
      await service.recordEvent('acc1', 'u1', 'EXPENSE_ADDED', 'exp1', { amount: 50, currency: 'PLN' });
      expect(prisma.familyFeedEvent.create).toHaveBeenCalledWith({
        data: { accountId: 'acc1', userId: 'u1', type: 'EXPENSE_ADDED', entityId: 'exp1', metadata: { amount: 50, currency: 'PLN' } },
      });
    });

    it('no-ops silently when account not found', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.recordEvent('acc1', 'u1', 'EXPENSE_ADDED', 'exp1', { amount: 50, currency: 'PLN' })).resolves.toBeUndefined();
      expect(prisma.familyFeedEvent.create).not.toHaveBeenCalled();
    });
  });

  // ── react / removeReaction ───────────────────────────────────────────

  describe('react', () => {
    it('upserts reaction with correct data', async () => {
      prisma.familyFeedEvent.findFirst.mockResolvedValue({ id: 'ev1' });
      prisma.feedReaction.upsert.mockResolvedValue({});
      await service.react('acc1', 'u1', 'ev1', '👍');
      expect(prisma.feedReaction.upsert).toHaveBeenCalledWith({
        where: { eventId_userId: { eventId: 'ev1', userId: 'u1' } },
        create: { eventId: 'ev1', userId: 'u1', emoji: '👍' },
        update: { emoji: '👍' },
      });
    });

    it('throws NotFoundException when event not in this account', async () => {
      prisma.familyFeedEvent.findFirst.mockResolvedValue(null);
      await expect(service.react('acc1', 'u1', 'bad-id', '👍')).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeReaction', () => {
    it('deletes reaction', async () => {
      prisma.familyFeedEvent.findFirst.mockResolvedValue({ id: 'ev1' });
      prisma.feedReaction.deleteMany.mockResolvedValue({ count: 1 });
      await service.removeReaction('acc1', 'u1', 'ev1');
      expect(prisma.feedReaction.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'ev1', userId: 'u1' } });
    });

    it('throws NotFoundException when event not found', async () => {
      prisma.familyFeedEvent.findFirst.mockResolvedValue(null);
      await expect(service.removeReaction('acc1', 'u1', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});

import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupsService, MAX_EXPENSES, MAX_GROUPS_OWNED } from './groups.service';
import { GroupMemberGuard } from './guards/group-member.guard';
import { GroupActiveGuard } from './guards/group-active.guard';
import { GroupOwnerGuard } from './guards/group-owner.guard';

const G = 'g-1';
const A = 'm-alice';
const B = 'm-bob';
const C = 'm-carol';

function mkMember(id: string, userId: string | null, over: any = {}) {
  return {
    id,
    groupId: G,
    userId,
    displayName: id,
    nameKey: id,
    claimTokenHash: null,
    paymentMethod: null,
    paymentHandle: null,
    removedAt: null,
    createdAt: new Date('2026-01-01'),
    ...over,
  };
}

describe('GroupsService', () => {
  let service: GroupsService;
  let prisma: any;
  let cache: any;
  let notifications: any;
  let group: any;
  let members: any[];
  let expenses: any[];
  let settlements: any[];

  beforeEach(() => {
    group = {
      id: G,
      name: 'Flat',
      emoji: null,
      currencyCode: 'PLN',
      ownerUserId: 'u-alice',
      guestToken: 'tok',
      guestAccess: true,
      status: 'active',
      ledgerVersion: 3,
    };
    members = [mkMember(A, 'u-alice'), mkMember(B, null), mkMember(C, 'u-carol')];
    // Alice paid 90 split equally: bob owes 30, carol owes 30.
    expenses = [
      {
        id: 'e1',
        paidByMemberId: A,
        amount: 90,
        date: new Date('2026-01-10'),
        shares: [
          { memberId: A, shareAmount: 30 },
          { memberId: B, shareAmount: 30 },
          { memberId: C, shareAmount: 30 },
        ],
      },
    ];
    settlements = [];

    const memberFindFirst = jest.fn(async ({ where }: any) => {
      const m = members.find(
        (x) =>
          (where.id === undefined || x.id === where.id) &&
          (where.groupId === undefined || x.groupId === where.groupId) &&
          (where.userId === undefined || x.userId === where.userId) &&
          (where.removedAt === undefined || x.removedAt === where.removedAt),
      );
      return m ? { ...m, group: { ownerUserId: group.ownerUserId } } : null;
    });
    prisma = {
      expenseGroup: {
        findUnique: jest.fn(async () => group),
        update: jest.fn(async () => group),
        updateMany: jest.fn(async () => ({ count: 1 })),
        count: jest.fn(async () => 0),
        create: jest.fn(),
        delete: jest.fn(),
      },
      expenseGroupMember: {
        findFirst: memberFindFirst,
        findMany: jest.fn(async ({ where }: any) => {
          if (where?.id?.in) return members.filter((m) => where.id.in.includes(m.id) && m.groupId === where.groupId && m.removedAt === null);
          return members.filter((m) => m.removedAt === null);
        }),
        count: jest.fn(async () => members.length),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      groupExpense: {
        findMany: jest.fn(async () => expenses),
        findFirst: jest.fn(async () => null),
        count: jest.fn(async () => expenses.length),
        create: jest.fn(),
        update: jest.fn(),
      },
      groupExpenseShare: { deleteMany: jest.fn() },
      groupSettlement: {
        findMany: jest.fn(async () => settlements),
        findFirst: jest.fn(async () => null),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    cache = { setIfAbsent: jest.fn(async () => true) };
    notifications = { sendToUser: jest.fn(async () => true) };
    service = new GroupsService(prisma, cache, notifications, { getRates: jest.fn() } as any);
  });

  describe('guards', () => {
    const ctx = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

    it('GroupMemberGuard answers 404 for a non-member', async () => {
      const p: any = { expenseGroupMember: { findFirst: jest.fn(async () => null) } };
      const guard = new GroupMemberGuard(p);
      await expect(guard.canActivate(ctx({ params: { groupId: G }, user: { id: 'stranger' } }))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('GroupMemberGuard sets groupId from the found row', async () => {
      const p: any = {
        expenseGroupMember: {
          findFirst: jest.fn(async () => ({ id: A, userId: 'u', groupId: 'real-group', group: { id: 'real-group', ownerUserId: 'u', status: 'active' } })),
        },
      };
      const req: any = { params: { groupId: 'param-group' }, user: { id: 'u' } };
      await new GroupMemberGuard(p).canActivate(ctx(req));
      expect(req.groupId).toBe('real-group');
      expect(req.groupMember.id).toBe(A);
    });

    it('GroupOwnerGuard rejects a non-owner and GroupActiveGuard rejects an archived group', () => {
      expect(() =>
        new GroupOwnerGuard().canActivate(ctx({ user: { id: 'x' }, groupMember: { group: { ownerUserId: 'y' } } })),
      ).toThrow(ForbiddenException);
      expect(() =>
        new GroupActiveGuard().canActivate(ctx({ groupMember: { group: { status: 'archived' } } })),
      ).toThrow(ForbiddenException);
      expect(new GroupActiveGuard().canActivate(ctx({ groupMember: { group: { status: 'active' } } }))).toBe(true);
    });
  });

  describe('detail', () => {
    it('never exposes a userId on a member', async () => {
      const d = await service.getDetail(G, A);
      expect(JSON.stringify(d)).not.toContain('u-alice');
      expect(d.members.find((m) => m.id === A)!.isAppUser).toBe(true);
      expect(d.members.find((m) => m.id === B)!.isAppUser).toBe(false);
      expect(d.isOwner).toBe(true);
      expect(d.guestUrl).toMatch(/\/g\/tok$/);
      expect(d.balances.reduce((s, b) => s + b.netAmount, 0)).toBeCloseTo(0, 2);
    });
  });

  describe('buildGuestUrl base (ABA-649)', () => {
    const saved = { g: process.env.GROUP_SHARE_BASE_URL, a: process.env.APP_PUBLIC_URL };
    afterEach(() => {
      for (const [k, v] of [['GROUP_SHARE_BASE_URL', saved.g], ['APP_PUBLIC_URL', saved.a]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    it('defaults to the API host when neither variable is set', async () => {
      delete process.env.GROUP_SHARE_BASE_URL;
      delete process.env.APP_PUBLIC_URL;
      expect((await service.getDetail(G, A)).guestUrl).toBe('https://api.ai-budget.pl/g/tok');
    });

    it('uses GROUP_SHARE_BASE_URL when set (trailing slash trimmed)', async () => {
      process.env.GROUP_SHARE_BASE_URL = 'https://ai-budget.pl/';
      expect((await service.getDetail(G, A)).guestUrl).toBe('https://ai-budget.pl/g/tok');
    });

    it('prefers GROUP_SHARE_BASE_URL over APP_PUBLIC_URL, and falls back to APP_PUBLIC_URL', async () => {
      process.env.APP_PUBLIC_URL = 'https://example.test';
      process.env.GROUP_SHARE_BASE_URL = 'https://ai-budget.pl';
      expect((await service.getDetail(G, A)).guestUrl).toBe('https://ai-budget.pl/g/tok');
      delete process.env.GROUP_SHARE_BASE_URL;
      expect((await service.getDetail(G, A)).guestUrl).toBe('https://example.test/g/tok');
    });
  });

  describe('createExpense', () => {
    const dto = (over: any = {}) => ({
      clientRequestId: 'req-00000001',
      description: 'Groceries',
      amount: 60,
      date: '2026-01-12',
      paidByMemberId: A,
      splitType: 'equal' as const,
      shares: [{ memberId: A }, { memberId: B }],
      ...over,
    });

    it('creates, bumps ledgerVersion in the same transaction and recreates shares', async () => {
      await service.createExpense(G, A, dto());
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.groupExpense.create).toHaveBeenCalled();
      expect(prisma.expenseGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ledgerVersion: { increment: 1 } } }),
      );
    });

    it('rejects a foreign memberId as payer (IDOR)', async () => {
      await expect(service.createExpense(G, A, dto({ paidByMemberId: 'foreign-member' }))).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.groupExpense.create).not.toHaveBeenCalled();
    });

    it('rejects a foreign memberId in shares (IDOR)', async () => {
      await expect(
        service.createExpense(G, A, dto({ shares: [{ memberId: A }, { memberId: 'foreign-member' }] })),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.groupExpense.create).not.toHaveBeenCalled();
    });

    it('rejects a removed member as a share', async () => {
      members[1].removedAt = new Date();
      await expect(service.createExpense(G, A, dto())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent on clientRequestId (pre-check)', async () => {
      prisma.groupExpense.findFirst.mockResolvedValueOnce({ id: 'existing' });
      const d = await service.createExpense(G, A, dto());
      expect(d.id).toBe(G);
      expect(prisma.groupExpense.create).not.toHaveBeenCalled();
    });

    it('is idempotent on a P2002 race', async () => {
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
      const d = await service.createExpense(G, A, dto());
      expect(d.id).toBe(G);
    });

    it('rejects exact shares that do not sum to the amount with 400', async () => {
      await expect(
        service.createExpense(G, A, dto({ splitType: 'exact', shares: [{ memberId: A, value: 10 }, { memberId: B, value: 10 }] })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('enforces the 5000 expense cap', async () => {
      prisma.groupExpense.count.mockResolvedValueOnce(MAX_EXPENSES);
      await expect(service.createExpense(G, A, dto())).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sends one coalesced push to other app-user members, never the actor', async () => {
      prisma.expenseGroupMember.findMany.mockImplementation(async ({ where }: any) => {
        if (where?.userId?.not === null) return [{ userId: 'u-carol' }];
        if (where?.id?.in) return members.filter((m) => where.id.in.includes(m.id));
        return members;
      });
      await service.createExpense(G, A, dto());
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(cache.setIfAbsent).toHaveBeenCalledWith(`grp:push:${G}:u-carol`, 600);
      expect(notifications.sendToUser).toHaveBeenCalledWith('u-carol', expect.any(Function), expect.any(Function), { groupId: G }, 'group_activity');
    });

    it('skips the push when coalesced', async () => {
      cache.setIfAbsent.mockResolvedValue(false);
      prisma.expenseGroupMember.findMany.mockImplementation(async ({ where }: any) => {
        if (where?.userId?.not === null) return [{ userId: 'u-carol' }];
        if (where?.id?.in) return members.filter((m) => where.id.in.includes(m.id));
        return members;
      });
      await service.createExpense(G, A, dto());
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(notifications.sendToUser).not.toHaveBeenCalled();
    });
  });

  describe('expenses by id are scoped to the group', () => {
    it('updateExpense 404s for an expense of another group', async () => {
      await expect(service.updateExpense(G, A, 'foreign-expense', { description: 'x' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.groupExpense.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'foreign-expense', groupId: G, deletedAt: null } }),
      );
    });

    it('voidSettlement 404s for a settlement of another group', async () => {
      await expect(service.voidSettlement(G, A, 'foreign-s')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.groupSettlement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'foreign-s', groupId: G, voidedAt: null } }),
      );
    });

    it('updateMember 404s for a foreign member id', async () => {
      await expect(service.updateMember(G, A, 'foreign-member', { displayName: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createSettlement', () => {
    const dto = (over: any = {}) => ({
      clientRequestId: 'req-00000002',
      fromMemberId: B,
      toMemberId: A,
      amount: 30,
      ledgerVersion: 3,
      ...over,
    });

    it('records a settlement matching a current transfer, CAS-bumping the version', async () => {
      await service.createSettlement(G, B, dto());
      expect(prisma.expenseGroup.updateMany).toHaveBeenCalledWith({
        where: { id: G, ledgerVersion: 3 },
        data: { ledgerVersion: { increment: 1 } },
      });
      expect(prisma.groupSettlement.create).toHaveBeenCalled();
    });

    it('lets the receiver record it too', async () => {
      await service.createSettlement(G, A, dto());
      expect(prisma.groupSettlement.create).toHaveBeenCalled();
    });

    it('refuses an acting member who is neither from nor to', async () => {
      await expect(service.createSettlement(G, C, dto())).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
    });

    // ABA-652: balances here are alice +60, bob -30, carol -30.
    it('records a partial payment, stored as sent', async () => {
      await service.createSettlement(G, B, dto({ amount: 12.5 }));
      expect(prisma.groupSettlement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 12.5, fromMemberId: B, toMemberId: A }) }),
      );
    });

    it('clamps an amount within the cent of tolerance to the bound', async () => {
      await service.createSettlement(G, B, dto({ amount: 30.01 }));
      expect(prisma.groupSettlement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ amount: 30 }) }),
      );
    });

    it('refuses paying more than is owed, before any write', async () => {
      const err = await service.createSettlement(G, B, dto({ amount: 30.02 })).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({ code: 'SETTLEMENT_EXCEEDS_BALANCE', reason: 'exceeds_balance' });
      await expect(service.createSettlement(G, B, dto({ amount: 1000 }))).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a payment to someone who is not owed (no becoming a creditor by settling)', async () => {
      // bob "pays" carol: carol owes too, so this would push her balance up and flip bob's sign.
      const err = await service.createSettlement(G, B, dto({ toMemberId: C, amount: 10 })).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({ code: 'SETTLEMENT_EXCEEDS_BALANCE', reason: 'not_creditor' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a payment from someone who owes nothing (reversed direction)', async () => {
      const err = await service.createSettlement(G, A, dto({ fromMemberId: A, toMemberId: B })).catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({ reason: 'not_debtor' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses an actor outside the pair even for a valid partial amount', async () => {
      await expect(service.createSettlement(G, C, dto({ amount: 5 }))).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts a payment to a creditor who is not the suggested one', async () => {
      // carol paid 60 for alice and bob: alice +30, bob -60, carol +30. Pay carol 25.
      expenses.push({
        id: 'e2',
        paidByMemberId: C,
        amount: 60,
        date: new Date('2026-01-11'),
        shares: [
          { memberId: A, shareAmount: 30 },
          { memberId: B, shareAmount: 30 },
        ],
      });
      await service.createSettlement(G, B, dto({ toMemberId: C, amount: 25 }));
      expect(prisma.groupSettlement.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ toMemberId: C, amount: 25 }) }),
      );
    });

    it('checks the stale version before the balance rule', async () => {
      await expect(service.createSettlement(G, B, dto({ amount: 1000, ledgerVersion: 2 }))).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a foreign from/to member id', async () => {
      await expect(service.createSettlement(G, B, dto({ toMemberId: 'foreign-member' }))).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
    });

    it('answers 409 LEDGER_CHANGED on a stale version, without writing', async () => {
      await expect(service.createSettlement(G, B, dto({ ledgerVersion: 2 }))).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('answers 409 when the CAS loses the race inside the transaction', async () => {
      prisma.expenseGroup.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.createSettlement(G, B, dto())).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
    });

    it('is idempotent on clientRequestId', async () => {
      prisma.groupSettlement.findFirst.mockResolvedValueOnce({ id: 's-existing' });
      await service.createSettlement(G, B, dto());
      expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
    });

    it('a replayed clientRequestId is a no-op even when its amount would now be refused', async () => {
      prisma.groupSettlement.findFirst.mockResolvedValueOnce({ id: 's-existing' });
      await service.createSettlement(G, B, dto({ amount: 1000 }));
      expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateGroup', () => {
    it('locks the currency once an expense exists', async () => {
      await expect(service.updateGroup(G, A, { currencyCode: 'EUR' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.expenseGroup.update).not.toHaveBeenCalled();
    });

    it('allows a currency change while the group has no expenses', async () => {
      prisma.groupExpense.count.mockResolvedValueOnce(0);
      await service.updateGroup(G, A, { currencyCode: 'EUR' });
      expect(prisma.expenseGroup.update).toHaveBeenCalledWith({ where: { id: G }, data: { currencyCode: 'EUR' } });
    });
  });

  describe('archive / rotate / remove', () => {
    it('archive answers 409 with open balances unless forced', async () => {
      await expect(service.archive(G, A, false)).rejects.toBeInstanceOf(ConflictException);
      await service.archive(G, A, true);
      expect(prisma.expenseGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'archived' }) }),
      );
    });

    it('archive succeeds without force when balances are zero', async () => {
      expenses = [];
      await service.archive(G, A, false);
      expect(prisma.expenseGroup.update).toHaveBeenCalled();
    });

    it('rotate-link regenerates the token and clears every claim', async () => {
      const r = await service.rotateLink(G);
      expect(r.guestUrl).toMatch(/\/g\/[0-9a-f]{32}$/);
      expect(r.guestUrl).not.toContain('/g/tok');
      expect(prisma.expenseGroupMember.updateMany).toHaveBeenCalledWith({
        where: { groupId: G },
        data: { claimTokenHash: null, claimedAt: null },
      });
    });

    it('removing a member with a non-zero balance is 409', async () => {
      await expect(service.removeMember(G, A, B)).rejects.toBeInstanceOf(ConflictException);
    });

    it('the owner cannot remove self; a non-owner cannot remove someone else', async () => {
      await expect(service.removeMember(G, A, A)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.removeMember(G, C, B)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('payment info is self only', async () => {
      await expect(service.updateMember(G, A, B, { paymentMethod: 'blik', paymentHandle: '123' })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('caps', () => {
    it('refuses a 21st owned group', async () => {
      prisma.expenseGroup.count.mockResolvedValueOnce(MAX_GROUPS_OWNED);
      await expect(service.createGroup('u-alice', 'Alice', { name: 'X', currencyCode: 'PLN' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.expenseGroup.create).not.toHaveBeenCalled();
    });

    it('refuses duplicate member names on create', async () => {
      await expect(
        service.createGroup('u-alice', 'Alice', { name: 'X', currencyCode: 'PLN', memberNames: ['bob', 'Bob'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses the 51st member', async () => {
      prisma.expenseGroupMember.count.mockResolvedValueOnce(50);
      await expect(service.addMember(G, A, { displayName: 'Dan' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('join', () => {
    it('404s on an unknown token or disabled guest access', async () => {
      prisma.expenseGroup.findUnique.mockResolvedValueOnce(null);
      await expect(service.join('u-x', { guestToken: 'nope-nope' })).rejects.toBeInstanceOf(NotFoundException);
      group.guestAccess = false;
      await expect(service.join('u-x', { guestToken: 'tok-tok-tok' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('loses the claim race with 409', async () => {
      prisma.expenseGroupMember.findFirst.mockResolvedValueOnce(null);
      prisma.expenseGroupMember.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.join('u-x', { guestToken: 'tok-tok-tok', memberId: B })).rejects.toBeInstanceOf(ConflictException);
    });

    describe('a removed member', () => {
      const removed = (over: any) => {
        members[0] = mkMember(A, 'u-x', { removedAt: new Date(), ...over });
        prisma.expenseGroupMember.findFirst.mockImplementation(async ({ where }: any) =>
          where.userId === 'u-x' ? members[0] : null,
        );
      };
      it('removed by the owner gets 403 GROUP_REMOVED and is NOT un-removed', async () => {
        removed({ removedByOwner: true });
        await expect(service.join('u-x', { guestToken: 'tok-tok-tok' })).rejects.toMatchObject({
          status: 403,
          response: { code: 'GROUP_REMOVED' },
        });
        expect(prisma.expenseGroupMember.update).not.toHaveBeenCalled();
      });
      it('who left on their own may rejoin through the member-cap check, in a transaction', async () => {
        removed({ removedByOwner: false });
        prisma.expenseGroupMember.count.mockResolvedValue(3);
        jest.spyOn(service, 'getDetail').mockResolvedValue({} as any);
        await service.join('u-x', { guestToken: 'tok-tok-tok' });
        expect(prisma.$transaction).toHaveBeenCalled();
        expect(prisma.expenseGroup.update).toHaveBeenCalled(); // row lock first
        expect(prisma.expenseGroupMember.update).toHaveBeenCalledWith({
          where: { id: A },
          data: { removedAt: null, removedByOwner: false, claimedAt: expect.any(Date) },
        });
      });
      it('who left on their own is refused when the group is full (50)', async () => {
        removed({ removedByOwner: false });
        prisma.expenseGroupMember.count.mockResolvedValue(50);
        await expect(service.join('u-x', { guestToken: 'tok-tok-tok' })).rejects.toMatchObject({
          response: { code: 'GROUP_MEMBER_LIMIT' },
        });
        expect(prisma.expenseGroupMember.update).not.toHaveBeenCalled();
      });
      it('who left on their own is refused when the group is archived', async () => {
        removed({ removedByOwner: false });
        group.status = 'archived';
        await expect(service.join('u-x', { guestToken: 'tok-tok-tok' })).rejects.toMatchObject({
          status: 403,
          response: { code: 'GROUP_ARCHIVED' },
        });
        expect(prisma.expenseGroupMember.update).not.toHaveBeenCalled();
      });
    });

    it('a new member goes through the locked, transactional member cap', async () => {
      const order: string[] = [];
      prisma.expenseGroupMember.findFirst.mockResolvedValueOnce(null);
      prisma.expenseGroup.update.mockImplementation(async () => void order.push('lock'));
      prisma.expenseGroupMember.count.mockImplementation(async () => {
        order.push('count');
        return 3;
      });
      prisma.expenseGroupMember.create.mockImplementation(async () => {
        order.push('create');
        return { id: 'm-new' };
      });
      jest.spyOn(service, 'getDetail').mockResolvedValue({} as any);
      await service.join('u-x', { guestToken: 'tok-tok-tok', displayName: 'Dan' });
      expect(order).toEqual(['lock', 'count', 'create']);
    });
  });

  describe('join: claim and provenance (ABA-647)', () => {
    it('picking a placeholder someone else just claimed is a 409 MEMBER_TAKEN', async () => {
      prisma.expenseGroupMember.findFirst.mockResolvedValueOnce(null);
      prisma.expenseGroupMember.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.join('u-x', { guestToken: 'tok-tok-tok', memberId: B })).rejects.toMatchObject({
        response: { code: 'MEMBER_TAKEN' },
        status: 409,
      });
    });

    it('claims atomically (only an unclaimed, live, user-less row) and records app_link', async () => {
      prisma.expenseGroupMember.findFirst.mockResolvedValueOnce(null);
      jest.spyOn(service, 'getDetail').mockResolvedValue({} as any);
      await service.join('u-x', { guestToken: 'tok-tok-tok', memberId: B });
      const arg = prisma.expenseGroupMember.updateMany.mock.calls[0][0];
      expect(arg.where).toMatchObject({ id: B, groupId: G, userId: null, claimTokenHash: null, removedAt: null });
      expect(arg.data).toMatchObject({ userId: 'u-x', joinedVia: 'app_link' });
    });

    it('a brand-new app member is app_link, a guest-page member is guest', async () => {
      prisma.expenseGroupMember.findFirst.mockResolvedValueOnce(null);
      prisma.expenseGroupMember.create.mockResolvedValue({ id: 'm-new' });
      jest.spyOn(service, 'getDetail').mockResolvedValue({} as any);
      await service.join('u-x', { guestToken: 'tok-tok-tok', displayName: 'Dan' });
      expect(prisma.expenseGroupMember.create.mock.calls[0][0].data.joinedVia).toBe('app_link');
      await service.createMember(G, 'Eve', null, 'hash');
      expect(prisma.expenseGroupMember.create.mock.calls[1][0].data.joinedVia).toBe('guest');
      await service.createMember(G, 'Fay', null);
      expect(prisma.expenseGroupMember.create.mock.calls[2][0].data.joinedVia).toBe('placeholder');
    });

    it('createGroup marks the owner and the placeholders', async () => {
      prisma.expenseGroup.count.mockResolvedValue(0);
      prisma.expenseGroup.create = jest.fn(async () => ({ id: G, members: [{ id: A, userId: 'u-alice' }] }));
      jest.spyOn(service, 'getDetail').mockResolvedValue({} as any);
      await service.createGroup('u-alice', 'Alice', { name: 'Flat', currencyCode: 'PLN', memberNames: ['Bob'] } as any);
      const created = prisma.expenseGroup.create.mock.calls[0][0].data.members.create;
      expect(created.map((m: any) => m.joinedVia)).toEqual(['owner', 'placeholder']);
    });
  });

  describe('preview (ABA-647)', () => {
    it('answers one identical 404 for malformed, unknown and guest-access-off tokens', async () => {
      const errs: any[] = [];
      for (const t of ['x', 'unknown-token']) {
        if (t === 'unknown-token') prisma.expenseGroup.findUnique.mockResolvedValueOnce(null);
        errs.push(await service.preview('u-x', t).catch((e) => e));
      }
      group.guestAccess = false;
      errs.push(await service.preview('u-x', 'tok-tok-tok').catch((e) => e));
      for (const e of errs) expect(e).toBeInstanceOf(NotFoundException);
      expect(new Set(errs.map((e) => JSON.stringify(e.getResponse()))).size).toBe(1);
    });

    it('lists only unclaimed live placeholders, id + displayName only', async () => {
      prisma.expenseGroupMember.findFirst.mockResolvedValueOnce(null);
      prisma.expenseGroupMember.findMany.mockResolvedValueOnce([{ id: B, displayName: 'Bob' }]);
      const res = await service.preview('u-x', 'tok-tok-tok');
      expect(prisma.expenseGroupMember.findMany.mock.calls[0][0].where).toEqual({
        groupId: G,
        userId: null,
        claimTokenHash: null,
        removedAt: null,
      });
      expect(res).toEqual({
        groupName: 'Flat',
        emoji: null,
        currencyCode: 'PLN',
        status: 'active',
        alreadyMember: false,
        unclaimed: [{ id: B, displayName: 'Bob' }],
      });
    });

    it('detects an existing live membership and returns the member id', async () => {
      prisma.expenseGroupMember.findFirst.mockResolvedValueOnce(mkMember(C, 'u-carol'));
      prisma.expenseGroupMember.findMany.mockResolvedValueOnce([]);
      const res = await service.preview('u-carol', 'tok-tok-tok');
      expect(res.alreadyMember).toBe(true);
      expect(res.myMemberId).toBe(C);
      expect(res.groupId).toBeTruthy(); // members get the group to open
    });

    it('a removed membership is not "already a member"', async () => {
      prisma.expenseGroupMember.findFirst.mockResolvedValueOnce(mkMember(C, 'u-carol', { removedAt: new Date() }));
      prisma.expenseGroupMember.findMany.mockResolvedValueOnce([]);
      const res = await service.preview('u-carol', 'tok-tok-tok');
      expect(res.alreadyMember).toBe(false);
      expect(res.myMemberId).toBeUndefined();
      expect(res.groupId).toBeUndefined(); // never disclosed to a non-member
    });

    it('an archived group is previewed but marked archived', async () => {
      group.status = 'archived';
      prisma.expenseGroupMember.findFirst.mockResolvedValueOnce(null);
      prisma.expenseGroupMember.findMany.mockResolvedValueOnce([]);
      expect((await service.preview('u-x', 'tok-tok-tok')).status).toBe('archived');
    });
  });

  // ABA-657 review H1: every ledger writer takes the group row lock FIRST, then re-checks the group
  // is active and every referenced member is live. The lock mock plays "a merge/removal committed
  // while we waited for the lock": the pre-lock validation passed, the in-lock one must fail.
  describe('ledger writers lock the group row first (ABA-657 review)', () => {
    const removeDuringLock = (id: string) =>
      prisma.expenseGroup.update.mockImplementation(async () => {
        members.find((m) => m.id === id)!.removedAt = new Date();
        return group;
      });
    const exp = {
      id: 'e1',
      groupId: G,
      description: 'x',
      amount: 90,
      date: new Date('2026-01-10'),
      deletedAt: null,
      itemized: false,
      splitType: 'equal',
      createdByMemberId: A,
      paidByMemberId: A,
      originalAmount: null,
      originalCurrency: null,
      fxRate: null,
      shares: [
        { memberId: A, shareValue: null, shareAmount: 45 },
        { memberId: B, shareValue: null, shareAmount: 45 },
      ],
    };
    const createDto = {
      clientRequestId: 'req-00000009',
      description: 'Groceries',
      amount: 60,
      date: '2026-01-12',
      paidByMemberId: A,
      splitType: 'equal' as const,
      shares: [{ memberId: A }, { memberId: B }],
    };

    it('createExpense: a share holder removed after validation fails under the lock, nothing is written', async () => {
      removeDuringLock(B);
      await expect(service.createExpense(G, A, createDto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.groupExpense.create).not.toHaveBeenCalled();
    });

    it('createExpense: a payer removed after validation fails under the lock', async () => {
      removeDuringLock(C);
      await expect(service.createExpense(G, A, { ...createDto, paidByMemberId: C })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.groupExpense.create).not.toHaveBeenCalled();
    });

    it('createExpense: takes the lock before the liveness check and the insert, and bumps once', async () => {
      await service.createExpense(G, A, createDto);
      const lock = prisma.expenseGroup.update.mock.invocationCallOrder[0];
      expect(lock).toBeLessThan(prisma.groupExpense.create.mock.invocationCallOrder[0]);
      expect(prisma.expenseGroup.update).toHaveBeenCalledTimes(1);
      expect(prisma.expenseGroup.update).toHaveBeenCalledWith(expect.objectContaining({ data: { ledgerVersion: { increment: 1 } } }));
    });

    it('createExpense (the bot and guest path): an archived group is refused under the lock', async () => {
      prisma.expenseGroup.update.mockImplementation(async () => ({ ...group, status: 'archived' }));
      await expect(service.createExpense(G, A, createDto)).rejects.toMatchObject({ status: 403, response: { code: 'GROUP_ARCHIVED' } });
      expect(prisma.groupExpense.create).not.toHaveBeenCalled();
    });

    it('updateExpense: a share holder merged away after validation fails under the lock', async () => {
      prisma.groupExpense.findFirst.mockResolvedValue(exp);
      removeDuringLock(B);
      await expect(service.updateExpense(G, A, 'e1', { description: 'y' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.groupExpenseShare.deleteMany).not.toHaveBeenCalled();
      expect(prisma.groupExpense.update).not.toHaveBeenCalled();
    });

    it('deleteExpense and voidSettlement take the group lock first', async () => {
      prisma.groupExpense.findFirst.mockResolvedValue({ id: 'e1', createdByMemberId: A, paidByMemberId: A });
      await service.deleteExpense(G, A, 'e1');
      expect(prisma.expenseGroup.update.mock.invocationCallOrder[0]).toBeLessThan(prisma.groupExpense.update.mock.invocationCallOrder[0]);

      prisma.expenseGroup.update.mockClear();
      prisma.groupSettlement.findFirst.mockResolvedValue({ id: 's1', recordedByMemberId: A, toMemberId: A });
      await service.voidSettlement(G, A, 's1');
      expect(prisma.expenseGroup.update.mock.invocationCallOrder[0]).toBeLessThan(prisma.groupSettlement.update.mock.invocationCallOrder[0]);
      prisma.expenseGroup.update.mockImplementation(async () => ({ ...group, status: 'archived' }));
      await expect(service.voidSettlement(G, A, 's1')).rejects.toMatchObject({ status: 403 });
    });

    it('createSettlement: a party removed between the CAS and the write fails, nothing recorded', async () => {
      prisma.expenseGroup.updateMany.mockImplementation(async () => {
        members.find((m) => m.id === A)!.removedAt = new Date();
        return { count: 1 };
      });
      await expect(
        service.createSettlement(G, B, { clientRequestId: 'req-00000003', fromMemberId: B, toMemberId: A, amount: 30, ledgerVersion: 3 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.groupSettlement.create).not.toHaveBeenCalled();
    });

    it('removeMember: a balance created after the pre-checks is caught under the lock', async () => {
      expenses = [];
      prisma.expenseGroup.update.mockImplementation(async () => {
        // an expense that committed before our lock: bob now owes 30
        expenses = [{ id: 'e2', paidByMemberId: A, amount: 60, date: new Date(), shares: [{ memberId: A, shareAmount: 30 }, { memberId: B, shareAmount: 30 }] }];
        return group;
      });
      await expect(service.removeMember(G, A, B)).rejects.toMatchObject({ status: 409, response: { code: 'NONZERO_BALANCE' } });
      expect(prisma.expenseGroupMember.update).not.toHaveBeenCalled();
    });
  });

  describe('member removal and the atomic cap', () => {
    it('records removedByOwner=true when the owner removes someone, false for a self-leave', async () => {
      expenses = [];
      await service.removeMember(G, A, B);
      expect(prisma.expenseGroupMember.update).toHaveBeenLastCalledWith({
        where: { id: B },
        data: expect.objectContaining({ removedByOwner: true }),
      });
      await service.removeMember(G, C, C);
      expect(prisma.expenseGroupMember.update).toHaveBeenLastCalledWith({
        where: { id: C },
        data: expect.objectContaining({ removedByOwner: false }),
      });
    });

    it('addMember takes the group row lock inside one $transaction before counting', async () => {
      const order: string[] = [];
      prisma.expenseGroup.update.mockImplementation(async () => void order.push('lock'));
      prisma.expenseGroupMember.count.mockImplementation(async () => {
        order.push('count');
        return 3;
      });
      prisma.expenseGroupMember.create.mockImplementation(async ({ data }: any) => {
        order.push('create');
        return mkMember('m-new', null, data);
      });
      await service.addMember(G, A, { displayName: 'Dan' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['lock', 'count', 'create']);
    });

    it('a duplicate name still maps to MEMBER_NAME_TAKEN through the transaction', async () => {
      prisma.expenseGroupMember.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.addMember(G, A, { displayName: 'Dan' })).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatConversationService } from './chat-conversation.service';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';

function buildDeps() {
  const prisma: any = {
    chatConversation: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    chatConversationPin: { createMany: jest.fn(), deleteMany: jest.fn() },
    chatMessage: { create: jest.fn().mockResolvedValue({ id: 'm1', createdAt: new Date('2026-05-25T10:00:00Z') }), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    accountMember: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() };
  return { prisma, cache };
}

describe('ChatConversationService', () => {
  let service: ChatConversationService;
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(async () => {
    deps = buildDeps();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChatConversationService,
        { provide: PrismaService, useValue: deps.prisma },
        { provide: CacheService, useValue: deps.cache },
      ],
    }).compile();
    service = moduleRef.get(ChatConversationService);
  });

  it('touchPresence writes a TTL key', async () => {
    await service.touchPresence('conv-1', 'user-1');
    expect(deps.cache.set).toHaveBeenCalledWith('chat:presence:conv-1:user-1', expect.any(String), 45);
  });

  it('isPresent returns true only when key exists', async () => {
    deps.cache.get.mockResolvedValueOnce('2026-05-25T10:00:00Z');
    expect(await service.isPresent('conv-1', 'user-1')).toBe(true);
    deps.cache.get.mockResolvedValueOnce(null);
    expect(await service.isPresent('conv-1', 'user-2')).toBe(false);
  });

  describe('scoping', () => {
    it('lists shared + own-private conversations for the account', async () => {
      deps.prisma.chatConversation.findMany.mockImplementation((args: any) => {
        // The pinned query is the same model, same base `where`, PLUS a
        // `pins: { some: { userId } }` filter and no `take` — distinguish the
        // two calls on that, the way the real two-query getConversations does.
        if (args?.where?.pins) return Promise.resolve([]);
        return Promise.resolve([
          { id: 'c1', title: 'A', isShared: true, userId: 'owner-1', createdAt: new Date(), updatedAt: new Date() },
        ]);
      });
      const res = await service.getConversations('bob-1', 'acc-1');
      expect(deps.prisma.chatConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { accountId: 'acc-1', OR: [{ isShared: true }, { userId: 'bob-1' }] },
        take: 20,
      }));
      expect(res[0]).toMatchObject({ id: 'c1', isShared: true, isOwner: false, isPinned: false });
    });

    it('marks a row pinned by the caller as isPinned, without duplicating it when it is also in the recent 20', async () => {
      const c1 = { id: 'c1', title: 'Pinned one', isShared: false, userId: 'bob-1', createdAt: new Date(), updatedAt: new Date() };
      const c2 = { id: 'c2', title: 'Not pinned', isShared: false, userId: 'bob-1', createdAt: new Date(), updatedAt: new Date() };
      deps.prisma.chatConversation.findMany.mockImplementation((args: any) => {
        if (args?.where?.pins) return Promise.resolve([c1]);
        return Promise.resolve([c1, c2]);
      });

      const res = await service.getConversations('bob-1', 'acc-1');

      expect(res.filter((r: any) => r.id === 'c1')).toHaveLength(1);
      expect(res.map((r: any) => r.id)).toEqual(['c1', 'c2']);
      expect(res[0]).toMatchObject({ id: 'c1', isPinned: true });
      expect(res[1]).toMatchObject({ id: 'c2', isPinned: false });
    });

    it('includes a pinned conversation that is outside the recent-20 query', async () => {
      const oldPin = { id: 'old-pin', title: 'Old pin', isShared: false, userId: 'bob-1', createdAt: new Date(), updatedAt: new Date() };
      const recentRows = Array.from({ length: 20 }, (_, i) => ({
        id: `recent-${i}`,
        title: `Recent ${i}`,
        isShared: false,
        userId: 'bob-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      deps.prisma.chatConversation.findMany.mockImplementation((args: any) => {
        if (args?.where?.pins) return Promise.resolve([oldPin]);
        return Promise.resolve(recentRows);
      });

      const res = await service.getConversations('bob-1', 'acc-1');

      expect(res.map((r: any) => r.id)).toContain('old-pin');
      expect(res[0]).toMatchObject({ id: 'old-pin', isPinned: true });
      expect(res).toHaveLength(21);
    });

    it('queries the unbounded pinned set scoped to the caller and the account', async () => {
      deps.prisma.chatConversation.findMany.mockResolvedValue([]);
      await service.getConversations('bob-1', 'acc-1');
      expect(deps.prisma.chatConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { accountId: 'acc-1', OR: [{ isShared: true }, { userId: 'bob-1' }], pins: { some: { userId: 'bob-1' } } },
      }));
      // Unbounded: no `take` on the pinned call — see the `objectContaining` above,
      // which would still pass with an unwanted `take` unless we assert its absence.
      const pinnedCall = deps.prisma.chatConversation.findMany.mock.calls.find((c: any) => c[0]?.where?.pins);
      expect(pinnedCall?.[0]?.take).toBeUndefined();
    });

    it('returns messages with resolved sender names', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', isShared: true, userId: 'owner-1' });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      deps.prisma.chatMessage.findMany.mockResolvedValue([
        { id: 'm1', conversationId: 'c1', role: 'user', content: 'hi', senderUserId: 'owner-1', mentionedUserIds: [], tokensUsed: null, createdAt: new Date() },
      ]);
      const res = await service.getConversationMessages('owner-1', 'c1', 'acc-1');
      expect(res[0]).toMatchObject({ senderUserId: 'owner-1', senderName: 'Alice' });
    });
  });

  describe('setConversationShared', () => {
    it('flips isShared for the creator', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1' });
      deps.prisma.chatConversation.update.mockResolvedValue({ id: 'c1', isShared: true });
      const r = await service.setConversationShared('owner-1', 'c1', 'acc-1', 'owner', true);
      expect(deps.prisma.chatConversation.update).toHaveBeenCalledWith({ where: { id: 'c1', accountId: 'acc-1' }, data: { isShared: true } });
      expect(r.isShared).toBe(true);
    });
    it('flips isShared for a non-owner member who created the conversation', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'bob-1' });
      deps.prisma.chatConversation.update.mockResolvedValue({ id: 'c1', isShared: true });
      const r = await service.setConversationShared('bob-1', 'c1', 'acc-1', 'editor', true);
      expect(r.isShared).toBe(true);
    });
    it('rejects a member who is not the conversation creator', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1' });
      await expect(service.setConversationShared('bob-1', 'c1', 'acc-1', 'editor', true)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when the conversation is not in the account', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      await expect(service.setConversationShared('owner-1', 'c-x', 'acc-1', 'owner', true)).rejects.toThrow(NotFoundException);
    });
  });

  describe('renameConversation', () => {
    it('renames for the creator and writes the CURRENT updatedAt back explicitly, so the row does not teleport to the top of the list', async () => {
      // Catches: dropping `updatedAt: conversation.updatedAt` from the update
      // data (or writing `new Date()`/`undefined` instead) — any of which
      // would let Prisma's own @updatedAt auto-bump fire and re-sort a
      // three-week-old conversation to position one.
      const existingUpdatedAt = new Date('2026-08-01T00:00:00Z');
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1', updatedAt: existingUpdatedAt });
      deps.prisma.chatConversation.update.mockResolvedValue({ id: 'c1', title: 'Grocery budget' });
      const r = await service.renameConversation('owner-1', 'c1', 'acc-1', 'Grocery budget');
      expect(deps.prisma.chatConversation.update).toHaveBeenCalledWith({
        where: { id: 'c1', accountId: 'acc-1' },
        data: { title: 'Grocery budget', updatedAt: existingUpdatedAt },
      });
      expect(r).toEqual({ id: 'c1', title: 'Grocery budget' });
    });

    it('rejects a member who is not the conversation creator (403)', async () => {
      // Catches: a rename gate that checks role instead of creatorship, or no
      // ownership check at all.
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1', updatedAt: new Date() });
      await expect(service.renameConversation('bob-1', 'c1', 'acc-1', 'New title')).rejects.toThrow(ForbiddenException);
      expect(deps.prisma.chatConversation.update).not.toHaveBeenCalled();
    });

    it('404s before any ownership check runs, and scopes the lookup by accountId so a row in a DIFFERENT account can never be found and fall through to the 403 branch', async () => {
      // The security property under test is the ORDER: a conversation that
      // exists (created by `owner-1`) but under a DIFFERENT account than the
      // caller's must 404, never 403 — a 403 would leak, via a 403-vs-404
      // response, that a conversation with this id exists somewhere outside
      // this account.
      //
      // A PRIOR version of this test tried to encode that scenario by having
      // the mock branch on `where.accountId === 'acc-2'` (the row's OWN
      // account) and return null otherwise. That is provably unable to catch
      // the regression it named: a correctly-scoped call passes
      // `accountId: 'acc-1'` (not 'acc-2', so !== 'acc-2' → null → 404,
      // correct), but a BUGGY call that drops `accountId` entirely passes
      // `where.accountId === undefined` — also `!== 'acc-2'` → ALSO null →
      // ALSO 404. Both paths produced an identical, passing result, so the
      // test could not distinguish "properly scoped" from "not scoped at
      // all". Mutation-tested and confirmed: dropping `accountId` from the
      // real `findFirst` call left this assertion green (see task-2-report.md
      // addendum). Fixed the way the pin predicate test in this same file
      // already does it: assert the ACTUAL call shape sent to Prisma, which
      // fails the instant `accountId` is missing or wrong, independent of any
      // row-matching logic in the mock.
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      await expect(service.renameConversation('bob-1', 'c1', 'acc-1', 'New title')).rejects.toThrow(NotFoundException);
      expect(deps.prisma.chatConversation.findFirst).toHaveBeenCalledWith({ where: { id: 'c1', accountId: 'acc-1' } });
      expect(deps.prisma.chatConversation.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteConversation', () => {
    it('hard-deletes the creator\'s conversation with one call, trusting the schema cascade for messages and pins', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1' });
      deps.prisma.chatConversation.delete.mockResolvedValue({ id: 'c1' });
      await service.deleteConversation('owner-1', 'c1', 'acc-1');
      expect(deps.prisma.chatConversation.delete).toHaveBeenCalledWith({ where: { id: 'c1', accountId: 'acc-1' } });
      // ChatMessage.conversation and ChatConversationPin.conversation are both
      // `onDelete: Cascade` in the schema — this is what a single
      // `chatConversation.delete()` call is allowed to rely on. Asserting
      // these were never called catches a "helpful" refactor that
      // reintroduces manual cleanup (redundant with the cascade, and one more
      // place to forget the pins table the cascade already covers for free)
      // — no soft delete, no undo, no bot cleanup, per the design.
      expect(deps.prisma.chatMessage.deleteMany).not.toHaveBeenCalled();
      expect(deps.prisma.chatConversationPin.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects a member who is not the conversation creator (403)', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1' });
      await expect(service.deleteConversation('bob-1', 'c1', 'acc-1')).rejects.toThrow(ForbiddenException);
      expect(deps.prisma.chatConversation.delete).not.toHaveBeenCalled();
    });

    it('404s before any ownership check runs, and scopes the lookup by accountId so a row in a DIFFERENT account can never be found and fall through to the 403 branch', async () => {
      // Identical security property to renameConversation's sibling test
      // above, and previously MISSING entirely here — the original version
      // of this describe block only had a bare "returns null -> 404" test in
      // this same spot, with no assertion on the query's shape (now folded
      // into this one). deleteConversation mirrors
      // setConversationShared/renameConversation's 404-before-403
      // order, so it carries the identical cross-account existence-disclosure
      // risk and deserves the identical test: assert the real `findFirst`
      // call shape, which fails the instant `accountId` is dropped from the
      // where and a row from a DIFFERENT account could otherwise be matched
      // and fall through to the ownership check (403 instead of 404).
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      await expect(service.deleteConversation('bob-1', 'c1', 'acc-1')).rejects.toThrow(NotFoundException);
      expect(deps.prisma.chatConversation.findFirst).toHaveBeenCalledWith({ where: { id: 'c1', accountId: 'acc-1' } });
      expect(deps.prisma.chatConversation.delete).not.toHaveBeenCalled();
    });
  });

  describe('setConversationPinned', () => {
    it('resolves with READ-VISIBILITY, not the /shared creator predicate', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1', isShared: true });
      deps.prisma.chatConversationPin.createMany.mockResolvedValue({ count: 1 });
      await service.setConversationPinned('bob-1', 'c1', 'acc-1', true);
      expect(deps.prisma.chatConversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'c1', accountId: 'acc-1', OR: [{ isShared: true }, { userId: 'bob-1' }] },
      });
    });

    // This is the fork's ruling, expressed as a test: without it, a later
    // "tidy-up" that makes pin a sibling of rename/delete (creator-only) would
    // pass every OTHER test in this file and silently take away the one
    // affordance a non-creator's row has.
    it('lets a NON-creator pin a shared conversation they can see', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1', isShared: true });
      deps.prisma.chatConversationPin.createMany.mockResolvedValue({ count: 1 });
      const r = await service.setConversationPinned('bob-1', 'c1', 'acc-1', true);
      expect(deps.prisma.chatConversationPin.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'bob-1', conversationId: 'c1' }],
        skipDuplicates: true,
      });
      expect(r).toEqual({ id: 'c1', isPinned: true });
    });

    it('lets the creator unpin their own conversation, idempotently via deleteMany', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', userId: 'owner-1', isShared: false });
      deps.prisma.chatConversationPin.deleteMany.mockResolvedValue({ count: 1 });
      const r = await service.setConversationPinned('owner-1', 'c1', 'acc-1', false);
      expect(deps.prisma.chatConversationPin.deleteMany).toHaveBeenCalledWith({ where: { userId: 'owner-1', conversationId: 'c1' } });
      expect(deps.prisma.chatConversationPin.createMany).not.toHaveBeenCalled();
      expect(r).toEqual({ id: 'c1', isPinned: false });
    });

    it('404s a private conversation the caller cannot see (not the creator, not shared) without confirming its existence via 403', async () => {
      // Catches: giving the pin endpoint /shared's `{ id, accountId }`
      // predicate (no OR) instead of the read-visibility one — which would
      // let ANY account member pin, and thereby confirm the existence of, a
      // co-member's PRIVATE conversation.
      deps.prisma.chatConversation.findFirst.mockResolvedValue(null);
      await expect(service.setConversationPinned('bob-1', 'c1', 'acc-1', true)).rejects.toThrow(NotFoundException);
      expect(deps.prisma.chatConversationPin.createMany).not.toHaveBeenCalled();
    });
  });

  describe('pollMessages', () => {
    it('touches presence and returns messages since timestamp', async () => {
      deps.prisma.chatConversation.findFirst.mockResolvedValue({ id: 'c1', accountId: 'acc-1', isShared: true, userId: 'owner-1' });
      deps.prisma.accountMember.findMany.mockResolvedValue([{ userId: 'owner-1', user: { name: 'Alice' } }]);
      deps.prisma.chatMessage.findMany.mockResolvedValue([]);
      await service.pollMessages('owner-1', 'c1', 'acc-1', '2026-05-25T10:00:00Z');
      expect(deps.cache.set).toHaveBeenCalledWith('chat:presence:c1:owner-1', expect.any(String), 45);
    });
  });
});

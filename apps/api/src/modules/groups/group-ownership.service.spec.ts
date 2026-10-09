import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { adoptIfOrphaned, FORMER_MEMBER_NAME, isAdoptionEligible, GroupOwnershipService, MAX_GROUPS_OWNED } from './group-ownership.service';
import { GroupsService, linkClaimBinding } from './groups.service';
import { GroupOwnerGuard } from './guards/group-owner.guard';

/**
 * ABA-650. An in-memory Prisma double that applies `where` the way Postgres would for the fields
 * these paths use, so the CAS and the succession order are exercised, not just mocked call shapes.
 * The hard-delete FK backstop (SetNull) is a database property and is NOT exercised here: it needs
 * a real Postgres run (see the wiki's known gaps).
 */

interface Row {
  id: string;
  groupId: string;
  userId: string | null;
  displayName: string;
  nameKey: string;
  removedAt: Date | null;
  createdAt: Date;
  paymentMethod?: string | null;
  paymentHandle?: string | null;
  claimTokenHash?: string | null;
  claimedAt?: Date | null;
  linkedAt?: Date | null;
}

function mkDb() {
  const users: Record<string, { isActive: boolean }> = {};
  const groups: { id: string; name: string; ownerUserId: string | null; status: string; orphanedAt?: Date | null }[] = [];
  const members: Row[] = [];
  const events: any[] = [];
  const match = (m: Row, where: any): boolean => {
    if (where.id !== undefined) {
      if (typeof where.id === 'string' && m.id !== where.id) return false;
      if (where.id?.not !== undefined && m.id === where.id.not) return false;
    }
    if (where.groupId !== undefined && m.groupId !== where.groupId) return false;
    if (where.removedAt === null && m.removedAt !== null) return false;
    if (where.userId !== undefined) {
      if (typeof where.userId === 'string' && m.userId !== where.userId) return false;
      // SQL semantics: `user_id <> x` never matches a NULL.
      if (where.userId?.not !== undefined && (m.userId === null || m.userId === where.userId.not)) return false;
    }
    if (where.user?.isActive !== undefined && !(m.userId && users[m.userId]?.isActive === where.user.isActive)) return false;
    return true;
  };
  const byJoin = (a: Row, b: Row) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);
  const db: any = {
    users,
    groups,
    members,
    events,
    expenseGroup: {
      count: jest.fn(async ({ where }: any) =>
        groups.filter((g) => g.ownerUserId === where.ownerUserId && (!where.status || g.status === where.status)).length,
      ),
      findMany: jest.fn(async ({ where }: any) => groups.filter((g) => g.ownerUserId === where.ownerUserId)),
      findUnique: jest.fn(async ({ where }: any) => {
        const g = groups.find((x) => x.id === where.id);
        return g ? { ...g } : null; // a snapshot, like a row read
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hits = groups.filter((g) => g.id === where.id && g.ownerUserId === where.ownerUserId);
        hits.forEach((g) => Object.assign(g, data));
        return { count: hits.length };
      }),
    },
    expenseGroupMember: {
      findFirst: jest.fn(async ({ where, select }: any) => {
        const m = [...members].sort(byJoin).find((x) => match(x, where));
        if (!m) return null;
        return select?.user ? { ...m, user: m.userId ? users[m.userId] ?? null : null } : { ...m };
      }),
      findMany: jest.fn(async ({ where }: any) => members.filter((x) => match(x, where)).map((x) => ({ ...x }))),
      update: jest.fn(async ({ where, data }: any) => {
        const m = members.find((x) => x.id === where.id)!;
        const clash = members.some((x) => x.id !== m.id && x.groupId === m.groupId && x.nameKey === data.nameKey);
        if (clash) throw Object.assign(new Error('unique'), { code: 'P2002' });
        Object.assign(m, data);
        return m;
      }),
    },
    groupMemberEvent: {
      create: jest.fn(async ({ data }: any) => {
        events.push({ ...data });
        return data;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hits = events.filter((e) => e.groupId === where.groupId && e.subjectMemberId === where.subjectMemberId);
        hits.forEach((e) => Object.assign(e, data));
        return { count: hits.length };
      }),
    },
    // Rolls the in-memory state back when the callback throws, like a Postgres transaction.
    $transaction: jest.fn(async (fn: any) => {
      const snap = JSON.stringify({ groups, members, events });
      const dates = (o: any) => {
        for (const k of ['createdAt', 'removedAt', 'claimedAt', 'linkedAt', 'orphanedAt']) if (o[k]) o[k] = new Date(o[k]);
        return o;
      };
      try {
        return await fn(db);
      } catch (e) {
        const back = JSON.parse(snap);
        groups.splice(0, groups.length, ...back.groups.map(dates));
        members.splice(0, members.length, ...back.members.map(dates));
        events.splice(0, events.length, ...back.events);
        throw e;
      }
    }),
  };
  return db;
}

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const member = (id: string, groupId: string, userId: string | null, joined: number, over: Partial<Row> = {}): Row => ({
  id,
  groupId,
  userId,
  displayName: id,
  nameKey: id.toLowerCase(),
  removedAt: null,
  createdAt: day(joined),
  ...over,
});

describe('GroupOwnershipService (ABA-650)', () => {
  let db: any;
  let notifications: any;
  let service: GroupOwnershipService;

  beforeEach(() => {
    db = mkDb();
    db.users['u-own'] = { isActive: true };
    db.users['u-bo'] = { isActive: true };
    db.users['u-cy'] = { isActive: true };
    db.groups.push({ id: 'g1', name: 'Flat', ownerUserId: 'u-own', status: 'active' });
    db.members.push(
      member('m-own', 'g1', 'u-own', 1, { displayName: 'Ann' }),
      member('m-guest', 'g1', null, 2, { displayName: 'Guest' }),
      member('m-bo', 'g1', 'u-bo', 3, { displayName: 'Bo' }),
      member('m-cy', 'g1', 'u-cy', 4, { displayName: 'Cy' }),
    );
    notifications = { sendToUser: jest.fn(async () => true) };
    service = new GroupOwnershipService(db, notifications);
  });

  describe('manual transfer', () => {
    const actor = { memberId: 'm-own', userId: 'u-own' };

    it('moves the owner, writes the event, and pushes the new owner', async () => {
      await service.transfer('g1', actor, 'm-cy');
      expect(db.groups[0].ownerUserId).toBe('u-cy');
      expect(db.events).toEqual([
        expect.objectContaining({
          kind: 'owner_transferred',
          actorMemberId: 'm-own',
          subjectMemberId: 'm-own',
          targetMemberId: 'm-cy',
          subjectName: 'Ann',
        }),
      ]);
      await new Promise((r) => setImmediate(r));
      expect(notifications.sendToUser).toHaveBeenCalledWith('u-cy', expect.any(Function), expect.any(Function), { groupId: 'g1' }, 'group_activity');
    });

    it('is a CAS on the current owner: a transfer that lost the race gets 409 OWNER_CHANGED and writes nothing', async () => {
      db.groups[0].ownerUserId = 'u-bo'; // someone transferred first
      await expect(service.transfer('g1', actor, 'm-cy')).rejects.toMatchObject({ response: { code: 'OWNER_CHANGED' } });
      expect(db.groups[0].ownerUserId).toBe('u-bo');
      expect(db.events).toHaveLength(0);
    });

    it('refuses a guest, an inactive account, a removed member and the caller themself', async () => {
      await expect(service.transfer('g1', actor, 'm-guest')).rejects.toBeInstanceOf(BadRequestException);
      db.users['u-bo'].isActive = false;
      await expect(service.transfer('g1', actor, 'm-bo')).rejects.toMatchObject({ response: { code: 'OWNER_TARGET_INVALID' } });
      db.members.find((m: Row) => m.id === 'm-cy')!.removedAt = day(9);
      await expect(service.transfer('g1', actor, 'm-cy')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.transfer('g1', actor, 'm-own')).rejects.toBeInstanceOf(BadRequestException);
      expect(db.groups[0].ownerUserId).toBe('u-own');
    });

    it('re-scopes the target to the group: a member id of another group is 404', async () => {
      db.groups.push({ id: 'g2', name: 'Other', ownerUserId: 'u-x', status: 'active' });
      db.users['u-x'] = { isActive: true };
      db.members.push(member('m-x', 'g2', 'u-x', 1));
      await expect(service.transfer('g1', actor, 'm-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 OWNER_LIMIT when the target already owns the maximum of active groups', async () => {
      for (let i = 0; i < MAX_GROUPS_OWNED; i++) {
        db.groups.push({ id: `cy-${i}`, name: 'x', ownerUserId: 'u-cy', status: 'active' });
      }
      await expect(service.transfer('g1', actor, 'm-cy')).rejects.toMatchObject({ response: { code: 'OWNER_LIMIT' } });
      expect(db.groups[0].ownerUserId).toBe('u-own');
    });

    it('GroupOwnerGuard: only the owner reaches the route, and nobody on an orphaned group', () => {
      const ctx = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;
      const guard = new GroupOwnerGuard();
      expect(guard.canActivate(ctx({ user: { id: 'u-own' }, groupMember: { group: { ownerUserId: 'u-own' } } }))).toBe(true);
      expect(() => guard.canActivate(ctx({ user: { id: 'u-bo' }, groupMember: { group: { ownerUserId: 'u-own' } } }))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(ctx({ user: { id: 'u-bo' }, groupMember: { group: { ownerUserId: null } } }))).toThrow(
        ForbiddenException,
      );
    });
  });

  describe('departure (soft delete / deactivation)', () => {
    it('hands each owned group to the earliest-joined live member with an active account, skipping guests', async () => {
      const out = await service.handleOwnerDeparture('u-own');
      expect(out).toEqual({ transferred: 1, orphaned: 0 });
      expect(db.groups[0].ownerUserId).toBe('u-bo');
      expect(db.events[0]).toEqual(
        expect.objectContaining({ actorMemberId: null, subjectMemberId: 'm-own', targetMemberId: 'm-bo', subjectName: 'Ann' }),
      );
    });

    it('skips an inactive account and a removed member when picking the successor', async () => {
      db.users['u-bo'].isActive = false;
      const out = await service.handleOwnerDeparture('u-own');
      expect(out.transferred).toBe(1);
      expect(db.groups[0].ownerUserId).toBe('u-cy');

      db.groups[0].ownerUserId = 'u-own';
      db.users['u-bo'].isActive = true;
      db.members.find((m: Row) => m.id === 'm-bo')!.removedAt = day(8);
      await service.handleOwnerDeparture('u-own');
      expect(db.groups[0].ownerUserId).toBe('u-cy');
    });

    it('orphans the group (owner NULL, never deleted) when nobody qualifies', async () => {
      db.users['u-bo'].isActive = false;
      db.users['u-cy'].isActive = false;
      const out = await service.handleOwnerDeparture('u-own');
      expect(out).toEqual({ transferred: 0, orphaned: 1 });
      expect(db.groups).toHaveLength(1);
      expect(db.groups[0].ownerUserId).toBeNull();
      expect(db.groups[0].orphanedAt).toBeInstanceOf(Date);
      expect(db.events[0]).toEqual(expect.objectContaining({ subjectMemberId: 'm-own', targetMemberId: null }));
      expect(notifications.sendToUser).not.toHaveBeenCalled();
    });

    it('handles every owned group and leaves groups it does not own alone', async () => {
      db.groups.push({ id: 'g2', name: 'Trip', ownerUserId: 'u-own', status: 'archived' });
      db.groups.push({ id: 'g3', name: 'Theirs', ownerUserId: 'u-bo', status: 'active' });
      db.members.push(member('m2-own', 'g2', 'u-own', 1), member('m2-cy', 'g2', 'u-cy', 2));
      await service.handleOwnerDeparture('u-own');
      expect(db.groups.find((g: any) => g.id === 'g2').ownerUserId).toBe('u-cy');
      expect(db.groups.find((g: any) => g.id === 'g3').ownerUserId).toBe('u-bo');
    });

    it('skips a group whose ownership moved concurrently (the CAS loses, no event)', async () => {
      db.expenseGroup.updateMany.mockResolvedValueOnce({ count: 0 });
      const out = await service.handleOwnerDeparture('u-own');
      expect(out).toEqual({ transferred: 0, orphaned: 0 });
      expect(db.events).toHaveLength(0);
    });
  });

  describe('leaving the platform with anonymization (hard delete and self delete)', () => {
    const run = (then: (tx: any) => Promise<any> = async () => 'done') => service.leavePlatform('u-own', { anonymize: true }, then);

    it('hands the group on, then renames every member row of the user to a unique "Former member"', async () => {
      db.groups.push({ id: 'g2', name: 'Trip', ownerUserId: 'u-bo', status: 'active' });
      db.members.push(
        member('m2-other', 'g2', null, 1, { displayName: FORMER_MEMBER_NAME, nameKey: FORMER_MEMBER_NAME.toLowerCase() }),
        member('m2-own', 'g2', 'u-own', 2, {
          displayName: 'Ann',
          paymentMethod: 'blik',
          paymentHandle: '+48 600',
          claimTokenHash: 'h',
          removedAt: day(5),
        }),
      );
      db.events.push({ groupId: 'g2', subjectMemberId: 'm2-own', subjectName: 'Ann' });

      await expect(run()).resolves.toBe('done');

      expect(db.groups[0].ownerUserId).toBe('u-bo');
      const g1row = db.members.find((m: Row) => m.id === 'm-own')!;
      const g2row = db.members.find((m: Row) => m.id === 'm2-own')!;
      expect(g1row.displayName).toBe(FORMER_MEMBER_NAME);
      // The name is unique per group, so a clash takes the next number; removed rows are renamed too.
      expect(g2row.displayName).toBe(`${FORMER_MEMBER_NAME} 2`);
      expect(g2row.nameKey).toBe(`${FORMER_MEMBER_NAME} 2`.toLowerCase());
      expect(g2row).toEqual(expect.objectContaining({ paymentMethod: null, paymentHandle: null, claimTokenHash: null }));
      // No snapshot of the old name survives in the activity.
      expect(db.events.filter((e: any) => e.subjectName === 'Ann')).toHaveLength(0);
      // The rows themselves stay (shared ledger history).
      expect(db.members.filter((m: Row) => m.id === 'm-own' || m.id === 'm2-own')).toHaveLength(2);
    });

    it('a suspension (anonymize: false) hands groups on but keeps the name and payment details', async () => {
      db.members.find((m: Row) => m.id === 'm-own')!.paymentMethod = 'blik';
      await service.leavePlatform('u-own', { anonymize: false }, async () => undefined);
      expect(db.groups[0].ownerUserId).toBe('u-bo');
      expect(db.members.find((m: Row) => m.id === 'm-own')).toEqual(
        expect.objectContaining({ displayName: 'Ann', paymentMethod: 'blik' }),
      );
    });

    it('rolls EVERYTHING back when the account change fails (no renames, owner unchanged, no push)', async () => {
      await expect(
        run(async () => {
          throw new Error('delete failed');
        }),
      ).rejects.toThrow('delete failed');
      expect(db.groups[0].ownerUserId).toBe('u-own');
      expect(db.members.find((m: Row) => m.id === 'm-own')!.displayName).toBe('Ann');
      expect(db.events).toHaveLength(0);
      await new Promise((r) => setImmediate(r));
      expect(notifications.sendToUser).not.toHaveBeenCalled();
    });

    it('rolls the ownership move back when the anonymization itself fails', async () => {
      db.expenseGroupMember.update.mockRejectedValueOnce(new Error('unique'));
      await expect(run()).rejects.toThrow('unique');
      expect(db.groups[0].ownerUserId).toBe('u-own');
      expect(db.events).toHaveLength(0);
      expect(db.members.find((m: Row) => m.id === 'm-own')!.displayName).toBe('Ann');
    });

    it('runs the account change on the transaction client, after the group steps', async () => {
      let ownerWhenAccountChanged: string | null | undefined;
      await run(async (tx) => {
        expect(tx).toBe(db);
        ownerWhenAccountChanged = db.groups[0].ownerUserId;
      });
      expect(ownerWhenAccountChanged).toBe('u-bo');
    });
  });

  describe('orphan adoption', () => {
    beforeEach(() => {
      db.groups[0].ownerUserId = null;
      db.groups[0].orphanedAt = day(10);
    });

    it('makes the member the owner atomically and records it', async () => {
      await expect(adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-cy', memberId: 'm-cy' })).resolves.toBe('adopted');
      expect(db.groups[0].ownerUserId).toBe('u-cy');
      expect(db.events[0]).toEqual(
        expect.objectContaining({ actorMemberId: 'm-cy', subjectMemberId: 'm-cy', targetMemberId: 'm-cy', subjectName: 'Cy' }),
      );
    });

    it('clears orphanedAt when the group is adopted', async () => {
      await adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-cy', memberId: 'm-cy' });
      expect(db.groups[0].orphanedAt).toBeNull();
    });

    it('refuses a member who joined, claimed, linked or rejoined AFTER the orphaning (403 on the route)', async () => {
      db.users['u-late'] = { isActive: true };
      db.users['u-claim'] = { isActive: true };
      db.users['u-link'] = { isActive: true };
      db.members.push(
        member('m-late', 'g1', 'u-late', 20),
        member('m-claim', 'g1', 'u-claim', 1, { claimedAt: day(20) }),
        member('m-link', 'g1', 'u-link', 1, { linkedAt: day(20) }),
      );
      for (const [mid, uid] of [['m-late', 'u-late'], ['m-claim', 'u-claim'], ['m-link', 'u-link']]) {
        await expect(adoptIfOrphaned(db, { groupId: 'g1', userId: uid, memberId: mid })).resolves.toBe('not_eligible');
        await expect(service.adopt('g1', mid, uid)).rejects.toMatchObject({ response: { code: 'ADOPT_NOT_ELIGIBLE' } });
      }
      expect(db.groups[0].ownerUserId).toBeNull();
      expect(db.events).toHaveLength(0);
    });

    it('refuses a removed member, a guest row and a member id that is not the caller', async () => {
      db.members.find((m: Row) => m.id === 'm-cy')!.removedAt = day(5);
      await expect(adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-cy', memberId: 'm-cy' })).resolves.toBe('not_eligible');
      await expect(adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-bo', memberId: 'm-guest' })).resolves.toBe('not_eligible');
      await expect(adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-bo', memberId: 'm-cy' })).resolves.toBe('not_eligible');
      expect(db.groups[0].ownerUserId).toBeNull();
    });

    it('a group with no orphanedAt is adoptable by nobody', async () => {
      db.groups[0].orphanedAt = null;
      await expect(adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-cy', memberId: 'm-cy' })).resolves.toBe('not_eligible');
    });

    it('isAdoptionEligible: live app user from before the orphaning only', () => {
      const base = { userId: 'u', removedAt: null, createdAt: day(1) };
      expect(isAdoptionEligible(base, day(2))).toBe(true);
      expect(isAdoptionEligible({ ...base, createdAt: day(3) }, day(2))).toBe(false);
      expect(isAdoptionEligible({ ...base, userId: null }, day(2))).toBe(false);
      expect(isAdoptionEligible(base, null)).toBe(false);
    });

    it('never takes over a group that has an owner', async () => {
      db.groups[0].ownerUserId = 'u-own';
      await expect(adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-cy', memberId: 'm-cy' })).resolves.toBe('has_owner');
      expect(db.groups[0].ownerUserId).toBe('u-own');
      await expect(service.adopt('g1', 'm-cy', 'u-cy')).rejects.toMatchObject({ response: { code: 'GROUP_HAS_OWNER' } });
    });

    it('only the first of two concurrent adopters wins', async () => {
      const [a, b] = await Promise.all([
        adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-bo', memberId: 'm-bo' }),
        adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-cy', memberId: 'm-cy' }),
      ]);
      expect([a, b].sort()).toEqual(['adopted', 'has_owner']);
      expect(db.events).toHaveLength(1);
    });

    it('respects the owned-groups cap (409 OWNER_LIMIT on the route)', async () => {
      for (let i = 0; i < MAX_GROUPS_OWNED; i++) {
        db.groups.push({ id: `cy-${i}`, name: 'x', ownerUserId: 'u-cy', status: 'active' });
      }
      await expect(adoptIfOrphaned(db, { groupId: 'g1', userId: 'u-cy', memberId: 'm-cy' })).resolves.toBe('limit');
      await expect(service.adopt('g1', 'm-cy', 'u-cy')).rejects.toBeInstanceOf(ConflictException);
      expect(db.groups[0].ownerUserId).toBeNull();
    });
  });
});

describe('GroupsService ownership-aware reads and adoption on join (ABA-650)', () => {
  const G = 'g-1';
  let prisma: any;
  let group: any;
  let members: any[];
  let events: any[];
  let service: GroupsService;

  beforeEach(() => {
    group = {
      id: G,
      name: 'Flat',
      emoji: null,
      currencyCode: 'PLN',
      ownerUserId: null,
      orphanedAt: new Date('2026-01-10'),
      guestToken: 'tok-tok-tok',
      guestAccess: true,
      status: 'active',
      ledgerVersion: 1,
    };
    members = [{ id: 'm-a', groupId: G, userId: 'u-a', displayName: 'Ann', removedAt: null, createdAt: new Date('2026-01-01') }];
    events = [];
    prisma = {
      expenseGroup: {
        findUnique: jest.fn(async () => group),
        count: jest.fn(async () => 0),
        update: jest.fn(async () => group),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (where.ownerUserId === null && group.ownerUserId === null) {
            Object.assign(group, data);
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      expenseGroupMember: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.userId !== undefined) return members.find((m) => m.userId === where.userId) ?? null;
          return members.find((m) => m.id === where.id) ?? null;
        }),
        findMany: jest.fn(async ({ where }: any) =>
          where?.id?.in ? members.filter((m) => where.id.in.includes(m.id)) : members.filter((m) => m.removedAt === null),
        ),
        count: jest.fn(async () => members.length),
        create: jest.fn(async ({ data }: any) => {
          const m = { id: 'm-new', removedAt: null, createdAt: new Date(), ...data };
          members.push(m);
          return m;
        }),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async ({ where, data }: any) => Object.assign(members.find((m) => m.id === where.id), data)),
      },
      groupExpense: { findMany: jest.fn(async () => []) },
      groupSettlement: { findMany: jest.fn(async () => []) },
      groupMemberEvent: {
        findMany: jest.fn(async () => events),
        create: jest.fn(async ({ data }: any) => {
          events.push({ id: `ev-${events.length}`, createdAt: new Date('2026-02-01'), ...data });
          return data;
        }),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    service = new GroupsService(prisma, { setIfAbsent: jest.fn() } as any, { sendToUser: jest.fn() } as any, { getRates: jest.fn() } as any);
  });

  it('an orphaned group reads isOrphaned, with no owner and isOwner false for everyone', async () => {
    const d = await service.getDetail(G, 'm-a');
    expect(d).toEqual(expect.objectContaining({ isOrphaned: true, isOwner: false, ownerMemberId: null }));
  });

  it('canAdopt is true only for a member who was live before the orphaning', async () => {
    members.push({ id: 'm-late', groupId: G, userId: 'u-late', displayName: 'Late', removedAt: null, createdAt: new Date('2026-01-20') });
    expect((await service.getDetail(G, 'm-a')).canAdopt).toBe(true);
    expect((await service.getDetail(G, 'm-late')).canAdopt).toBe(false);
    group.status = 'archived';
    expect((await service.getDetail(G, 'm-a')).canAdopt).toBe(false);
    group.status = 'active';
    group.ownerUserId = 'u-a';
    expect((await service.getDetail(G, 'm-a')).canAdopt).toBe(false);
  });

  it('joining an orphaned group under a new name does NOT adopt it', async () => {
    await service.join('u-new', { guestToken: group.guestToken, displayName: 'Neo' } as any);
    expect(group.ownerUserId).toBeNull();
    expect(events).toHaveLength(0);
    expect(prisma.expenseGroup.updateMany).not.toHaveBeenCalled();
  });

  it('claiming a placeholder in an orphaned group does NOT adopt it', async () => {
    members.push({ id: 'm-ph', groupId: G, userId: null, displayName: 'Ph', removedAt: null, createdAt: new Date() });
    await service.join('u-new', { guestToken: group.guestToken, memberId: 'm-ph' } as any);
    expect(group.ownerUserId).toBeNull();
  });

  it('a self-removed member rejoining an orphaned group does not adopt it', async () => {
    members.push({ id: 'm-r', groupId: G, userId: 'u-r', displayName: 'Rj', removedAt: new Date('2026-01-05'), removedByOwner: false, createdAt: new Date('2026-01-02') });
    await service.join('u-r', { guestToken: group.guestToken } as any);
    expect(group.ownerUserId).toBeNull();
    // The rejoin is stamped, so the member stays ineligible for an adoption of THIS orphaning.
    expect(members.find((m) => m.id === 'm-r').claimedAt).toBeInstanceOf(Date);
    expect(prisma.expenseGroup.updateMany).not.toHaveBeenCalled();
  });

  it('linking a guest row does NOT adopt an orphaned group', async () => {
    members.push({ id: 'm-g', groupId: G, userId: null, displayName: 'Gi', claimTokenHash: 'h-g', removedAt: null, createdAt: new Date() });
    const cache = {
      getAndDelete: jest.fn(async () => ({ groupId: G, memberId: 'm-g', guestToken: group.guestToken, claim: linkClaimBinding('h-g') })),
    };
    service = new GroupsService(prisma, cache as any, { sendToUser: jest.fn() } as any, { getRates: jest.fn() } as any);
    prisma.expenseGroupMember.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.userId !== undefined) return null; // not yet a member
      return members.find((m) => m.id === where.id) ?? null;
    });
    await service.linkGuest('u-new', 'f'.repeat(32)).catch(() => undefined);
    expect(group.ownerUserId).toBeNull();
  });

  it('joining a group that has an owner never changes it', async () => {
    group.ownerUserId = 'u-a';
    await service.join('u-new', { guestToken: group.guestToken, displayName: 'Neo' } as any);
    expect(group.ownerUserId).toBe('u-a');
    expect(prisma.expenseGroup.updateMany).not.toHaveBeenCalled();
  });

  it('the app activity carries every event kind, with current names for actor and target', async () => {
    events = [
      { id: 'e1', groupId: G, kind: 'owner_transferred', actorMemberId: 'm-a', subjectMemberId: 'm-a', targetMemberId: 'm-a', subjectName: 'Ann (old)', createdAt: new Date('2026-02-02') },
      { id: 'e2', groupId: G, kind: 'claim_reset', actorMemberId: 'm-a', subjectMemberId: 'm-x', targetMemberId: null, subjectName: 'Xi', createdAt: new Date('2026-02-01') },
    ];
    const page = await service.getActivity(G);
    expect(prisma.groupMemberEvent.findMany.mock.calls[0][0].where.kind).toBeUndefined();
    expect(page.items.map((i) => i.kind)).toEqual(['event', 'event']);
    const first = page.items[0] as any;
    expect(first.event).toEqual(
      expect.objectContaining({ kind: 'owner_transferred', subjectName: 'Ann (old)', targetName: 'Ann', actorName: 'Ann' }),
    );
    expect((page.items[1] as any).event.targetName).toBeNull();
  });
});

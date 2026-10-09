import { GroupReminderCron } from './group-reminder.cron';
import * as ni18n from '../notifications/notification-i18n';

const day = (n: number, hour = 17) => new Date(Date.UTC(2026, 9, 1 + n, hour));

interface Row {
  id: string;
  groupId: string;
  userId: string | null;
  removedAt: Date | null;
  balanceOpenSince: Date | null;
  balanceOpenSign: number | null;
  lastReminderAt: Date | null;
  reminderCount: number;
}

const sameTime = (a: Date | null, b: Date | null) => (a ? a.getTime() : null) === (b ? b.getTime() : null);

/**
 * An in-memory stand-in for the three tables the cron touches. `updateMany` honours the `where`
 * columns the cron uses, so the compare-and-swap claim behaves as it would on Postgres.
 */
function setup() {
  const groups: { id: string; name: string; currencyCode: string }[] = [];
  const rows = new Map<string, Row>();
  const balances = new Map<string, Map<string, number>>();
  const transfers = new Map<string, { fromMemberId: string; toMemberId: string; amount: number }[]>();
  const users = new Map<string, { isActive: boolean; notifyGroupReminders: boolean; pushToken: string | null }>();

  const prisma: any = {
    expenseGroup: {
      findMany: jest.fn(async (args: any) => {
        const sorted = [...groups].sort((a, b) => (a.id < b.id ? -1 : 1));
        let start = 0;
        if (args.cursor) start = sorted.findIndex((g) => g.id === args.cursor.id) + (args.skip ?? 0);
        return sorted.slice(start, start + args.take);
      }),
    },
    expenseGroupMember: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const r = rows.get(where.id);
        if (!r || r.groupId !== where.groupId) return { count: 0 };
        if ('removedAt' in where && r.removedAt !== where.removedAt) return { count: 0 };
        if ('reminderCount' in where && r.reminderCount !== where.reminderCount) return { count: 0 };
        if ('balanceOpenSign' in where && r.balanceOpenSign !== where.balanceOpenSign) return { count: 0 };
        if ('lastReminderAt' in where && !sameTime(r.lastReminderAt, where.lastReminderAt)) return { count: 0 };
        for (const [k, v] of Object.entries(data)) {
          (r as any)[k] = v && typeof v === 'object' && 'increment' in (v as any) ? (r as any)[k] + (v as any).increment : v;
        }
        return { count: 1 };
      }),
    },
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        (where.id.in as string[])
          .filter((id) => {
            const u = users.get(id);
            return !!u && u.isActive && u.notifyGroupReminders && !!u.pushToken;
          })
          .map((id) => ({ id })),
      ),
    },
  };

  const groupsService: any = {
    loadState: jest.fn(async (groupId: string) => {
      const members = [...rows.values()].filter((r) => r.groupId === groupId && !r.removedAt).map((r) => ({ ...r }));
      const net = balances.get(groupId) ?? new Map();
      return {
        members,
        ledger: {
          balances: members.map((m) => ({ memberId: m.id, netAmount: net.get(m.id) ?? 0 })),
          suggestedTransfers: transfers.get(groupId) ?? [],
        },
      };
    }),
  };

  const notifications: any = { sendToUser: jest.fn().mockResolvedValue(true) };
  const cron = new GroupReminderCron(prisma, groupsService, notifications);

  const addGroup = (id: string, name = id) => {
    groups.push({ id, name, currencyCode: 'PLN' });
    balances.set(id, new Map());
  };
  const addMember = (groupId: string, id: string, userId: string | null, balance: number) => {
    rows.set(id, {
      id,
      groupId,
      userId,
      removedAt: null,
      balanceOpenSince: null,
      balanceOpenSign: null,
      lastReminderAt: null,
      reminderCount: 0,
    });
    balances.get(groupId)!.set(id, balance);
    if (userId && !users.has(userId)) users.set(userId, { isActive: true, notifyGroupReminders: true, pushToken: 'ExponentPushToken[x]' });
  };
  const setBalance = (groupId: string, memberId: string, balance: number) => balances.get(groupId)!.set(memberId, balance);
  const sentTo = () => notifications.sendToUser.mock.calls.map((c: any[]) => c[0]);
  /** Runs the cron on each listed day and returns which days a push went to `userId`. */
  const runDays = async (days: number[], userId: string) => {
    const hit: number[] = [];
    for (const d of days) {
      const before = sentTo().filter((u: string) => u === userId).length;
      await cron.run(day(d));
      if (sentTo().filter((u: string) => u === userId).length > before) hit.push(d);
    }
    return hit;
  };

  return { cron, prisma, groupsService, notifications, rows, users, transfers, addGroup, addMember, setBalance, sentTo, runDays };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('GroupReminderCron', () => {
  it('reminds weekly from 7 days after the balance opened, at most 4 times', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', -42);
    t.addMember('g1', 'bo', null, 42);

    expect(await t.runDays(range(0, 60), 'u-ann')).toEqual([7, 14, 21, 28]);
    expect(t.rows.get('ann')!.reminderCount).toBe(4);
  });

  it('a settled balance resets the count, and a reopened one starts a new weekly clock', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', -42);
    t.addMember('g1', 'bo', null, 42);

    expect(await t.runDays(range(0, 15), 'u-ann')).toEqual([7, 14]);
    t.setBalance('g1', 'ann', 0);
    await t.cron.run(day(16));
    expect(t.rows.get('ann')).toMatchObject({ balanceOpenSince: null, balanceOpenSign: null, lastReminderAt: null, reminderCount: 0 });

    t.setBalance('g1', 'ann', -10);
    expect(await t.runDays(range(17, 60), 'u-ann')).toEqual([24, 31, 38, 45]);
  });

  it('a sign flip is a new episode', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', -42);
    t.addMember('g1', 'bo', 'u-bo', 42);
    expect(await t.runDays(range(0, 8), 'u-ann')).toEqual([7]);
    t.setBalance('g1', 'ann', 30);
    expect(await t.runDays(range(9, 16), 'u-ann')).toEqual([16]);
    expect(t.rows.get('ann')!.balanceOpenSign).toBe(1);
  });

  it('never reminds about a balance under the 1.00 floor', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', -0.99);
    t.addMember('g1', 'bo', 'u-bo', 0.99);
    expect(await t.runDays(range(0, 30), 'u-ann')).toEqual([]);
    expect(t.notifications.sendToUser).not.toHaveBeenCalled();
    expect(t.rows.get('ann')!.balanceOpenSince).toBeNull();
  });

  it('never reminds a guest and never writes reminder state on a guest row', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', 42);
    t.addMember('g1', 'guest', null, -42);
    await t.runDays(range(0, 30), 'u-ann');
    expect(t.sentTo().every((u: string) => u === 'u-ann')).toBe(true);
    const guestWrites = t.prisma.expenseGroupMember.updateMany.mock.calls.filter((c: any[]) => c[0].where.id === 'guest');
    expect(guestWrites).toHaveLength(0);
  });

  it('reminds both sides: owe for the debtor (with the pay pair), owed for the creditor (no pair)', async () => {
    const t = setup();
    t.addGroup('g1', 'Flat');
    t.addMember('g1', 'ann', 'u-ann', -42);
    t.addMember('g1', 'bo', 'u-bo', 42);
    t.transfers.set('g1', [{ fromMemberId: 'ann', toMemberId: 'bo', amount: 42 }]);
    await t.runDays(range(0, 7), 'u-ann');

    const calls = t.notifications.sendToUser.mock.calls;
    const ann = calls.find((c: any[]) => c[0] === 'u-ann');
    const bo = calls.find((c: any[]) => c[0] === 'u-bo');
    expect(ann[3]).toEqual({ groupId: 'g1', reminder: 'owe', fromMemberId: 'ann', toMemberId: 'bo' });
    expect(ann[4]).toBe('group_reminder');
    expect(ann[1]('en')).toBe(ni18n.groupReminderTitle('en', { groupName: 'Flat', amount: '42.00', currencyCode: 'PLN', direction: 'owe' }));
    expect(ann[2]('en')).toContain('42.00 PLN');
    expect(bo[3]).toEqual({ groupId: 'g1', reminder: 'owed' });
    expect(bo[2]('pl')).toBe(ni18n.groupReminderBody('pl', { groupName: 'Flat', amount: '42.00', currencyCode: 'PLN', direction: 'owed' }));
  });

  it('is idempotent per day: a second run the same day sends nothing', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', -42);
    t.addMember('g1', 'bo', null, 42);
    await t.runDays(range(0, 6), 'u-ann');
    expect(await t.cron.run(day(7))).toBe(1);
    expect(await t.cron.run(day(7, 23))).toBe(0);
    expect(t.rows.get('ann')!.reminderCount).toBe(1);
  });

  it('a lost compare-and-swap (another run claimed it) sends nothing', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', -42);
    t.addMember('g1', 'bo', null, 42);
    await t.runDays(range(0, 6), 'u-ann');
    // A concurrent instance claims the reminder between this run's scan and its send.
    const realLoad = t.groupsService.loadState.getMockImplementation();
    t.groupsService.loadState.mockImplementationOnce(async (gid: string) => {
      const state = await realLoad(gid);
      t.rows.get('ann')!.reminderCount = 1;
      t.rows.get('ann')!.lastReminderAt = day(7, 16);
      return state;
    });
    expect(await t.cron.run(day(7))).toBe(0);
    expect(t.notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('sends at most one reminder per user per day, the largest balance first', async () => {
    const t = setup();
    t.addGroup('g1', 'Flat');
    t.addGroup('g2', 'Trip');
    t.addMember('g1', 'ann1', 'u-ann', -10);
    t.addMember('g1', 'x1', null, 10);
    t.addMember('g2', 'ann2', 'u-ann', 80);
    t.addMember('g2', 'x2', null, -80);
    await t.runDays(range(0, 6), 'u-ann');

    await t.cron.run(day(7));
    expect(t.notifications.sendToUser).toHaveBeenCalledTimes(1);
    expect(t.notifications.sendToUser.mock.calls[0][3].groupId).toBe('g2');
    // The other group stays due and goes out the next day.
    await t.cron.run(day(8));
    expect(t.notifications.sendToUser).toHaveBeenCalledTimes(2);
    expect(t.notifications.sendToUser.mock.calls[1][3].groupId).toBe('g1');
  });

  it('skips a user who opted out without spending their reminder, and resumes when they opt back in', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', -42);
    t.addMember('g1', 'bo', null, 42);
    t.users.get('u-ann')!.notifyGroupReminders = false;
    expect(await t.runDays(range(0, 10), 'u-ann')).toEqual([]);
    expect(t.rows.get('ann')!.reminderCount).toBe(0);
    expect(t.rows.get('ann')!.balanceOpenSince).toEqual(day(0)); // the episode clock still runs

    t.users.get('u-ann')!.notifyGroupReminders = true;
    expect(await t.runDays([11], 'u-ann')).toEqual([11]);
  });

  it('skips an inactive account and a user with no push token', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', -42);
    t.addMember('g1', 'bo', 'u-bo', 42);
    t.users.get('u-ann')!.isActive = false;
    t.users.get('u-bo')!.pushToken = null;
    await t.runDays(range(0, 14), 'u-ann');
    expect(t.notifications.sendToUser).not.toHaveBeenCalled();
  });

  it('streams only active groups with an app-user member, in id-ordered pages of 500', async () => {
    const t = setup();
    for (let i = 0; i < 501; i++) {
      const id = `g${String(i).padStart(4, '0')}`;
      t.addGroup(id);
      t.addMember(id, `m${i}`, `u${i}`, 0);
    }
    await t.cron.run(day(0));
    const calls = t.prisma.expenseGroup.findMany.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toMatchObject({
      where: { status: 'active', members: { some: { userId: { not: null }, removedAt: null } } },
      take: 500,
      orderBy: { id: 'asc' },
    });
    expect(calls[0][0].cursor).toBeUndefined();
    expect(calls[1][0]).toMatchObject({ cursor: { id: 'g0499' }, skip: 1 });
    expect(t.groupsService.loadState).toHaveBeenCalledTimes(501);
  });

  it('one failing group does not stop the run', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addGroup('g2');
    t.addMember('g2', 'ann', 'u-ann', -42);
    t.addMember('g2', 'bo', null, 42);
    await t.runDays(range(0, 6), 'u-ann');
    const realLoad = t.groupsService.loadState.getMockImplementation();
    t.groupsService.loadState.mockImplementation(async (gid: string) => {
      if (gid === 'g1') throw new Error('boom');
      return realLoad(gid);
    });
    expect(await t.cron.run(day(7))).toBe(1);
  });

  it('a rejected push is logged, not thrown', async () => {
    const t = setup();
    t.addGroup('g1');
    t.addMember('g1', 'ann', 'u-ann', -42);
    t.addMember('g1', 'bo', null, 42);
    t.notifications.sendToUser.mockRejectedValue(new Error('expo down'));
    await expect(t.runDays(range(0, 7), 'u-ann')).resolves.toBeDefined();
  });
});

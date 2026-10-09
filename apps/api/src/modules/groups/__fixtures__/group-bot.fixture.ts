import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupBotService } from '../group-bot.service';

/**
 * In-memory stand-ins for the bot group flow's specs (ABA-658): the three bot handler specs and the
 * service spec build the REAL GroupBotService over these. No jest globals, so it is safe for tsc.
 *
 * `createExpense` mirrors the real dedup (`{groupId, clientRequestId}` -> no second row) and the
 * real FX refusal, so "double confirm creates one expense" and "unknown rate" are exercised through
 * the same contract `GroupsService.createExpense` has.
 */

export interface FakeGroup {
  id: string;
  name: string;
  emoji: string | null;
  currencyCode: string;
  status: 'active' | 'archived';
  updatedAt: Date;
}

export interface FakeMember {
  id: string;
  groupId: string;
  userId: string | null;
  removedAt: Date | null;
  createdAt: Date;
}

export interface FakeExpense {
  groupId: string;
  memberId: string;
  dto: any;
  amount: number;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function makeGroupBotWorld() {
  const groups: FakeGroup[] = [];
  const members: FakeMember[] = [];
  const expenses: FakeExpense[] = [];
  const cacheStore = new Map<string, unknown>();
  /** Unit rates (1 X in the group currency) the fake provider knows; missing = unknown. */
  const rates: Record<string, number> = { EUR: 4.3 };
  let seq = 0;

  const addGroup = (g: Partial<FakeGroup> & { name: string }, memberUserIds: (string | null)[]) => {
    seq += 1;
    const group: FakeGroup = {
      id: uuid(1000 + seq),
      emoji: null,
      currencyCode: 'PLN',
      status: 'active',
      updatedAt: new Date(2026, 9, seq),
      ...g,
    };
    groups.push(group);
    memberUserIds.forEach((userId, i) => {
      members.push({ id: uuid(2000 + seq * 50 + i), groupId: group.id, userId, removedAt: null, createdAt: new Date(2026, 0, i + 1) });
    });
    return group;
  };

  const liveOf = (groupId: string) => members.filter((m) => m.groupId === groupId && m.removedAt === null);
  const groupOf = (id: string) => groups.find((g) => g.id === id)!;
  const pickGroup = (g: FakeGroup) => ({ id: g.id, name: g.name, emoji: g.emoji, currencyCode: g.currencyCode });
  const activeOnly = (where: any, g: FakeGroup) => !where.group?.status || g.status === where.group.status;

  const prisma = {
    expenseGroupMember: {
      findMany: async ({ where, take }: any) => {
        if (where.userId) {
          return members
            .filter((m) => m.userId === where.userId && m.removedAt === null && activeOnly(where, groupOf(m.groupId)))
            .map((m) => groupOf(m.groupId))
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, take ?? 1000)
            .map((g) => ({ group: pickGroup(g) }));
        }
        return liveOf(where.groupId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((m) => ({ id: m.id }));
      },
      findFirst: async ({ where }: any) => {
        const m = members.find(
          (x) => x.groupId === where.groupId && x.userId === where.userId && x.removedAt === null && activeOnly(where, groupOf(x.groupId)),
        );
        return m ? { id: m.id, group: pickGroup(groupOf(m.groupId)) } : null;
      },
      count: async ({ where }: any) => liveOf(where.groupId).length,
    },
    groupExpense: {
      findFirst: async ({ where }: any) => {
        const e = expenses.find((x) => x.groupId === where.groupId && x.dto.clientRequestId === where.clientRequestId);
        return e ? { amount: e.amount, createdByMemberId: e.memberId } : null;
      },
    },
  };

  const counters = new Map<string, number>();
  const cache = {
    incrementWindow: async (key: string) => {
      counters.set(key, (counters.get(key) ?? 0) + 1);
      return counters.get(key)!;
    },
    get: async (key: string) => (cacheStore.has(key) ? JSON.parse(JSON.stringify(cacheStore.get(key))) : null),
    set: async (key: string, value: unknown) => {
      cacheStore.set(key, JSON.parse(JSON.stringify(value)));
    },
    del: async (...keys: string[]) => {
      for (const k of keys) cacheStore.delete(k);
    },
  };

  const fxCode = (code: string, message: string) => new BadRequestException({ code, message });
  const supported = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];

  const groupsService = {
    fxPreview: async (groupId: string, currency: string) => {
      const g = groupOf(groupId);
      if (currency !== g.currencyCode && !supported.includes(currency)) throw fxCode('CURRENCY_UNSUPPORTED', 'unsupported');
      return { groupCurrency: g.currencyCode, currencyCode: currency, rate: currency === g.currencyCode ? 1 : rates[currency] ?? null };
    },
    createExpense: async (groupId: string, memberId: string, dto: any) => {
      // GroupsService.resolveActor: the actor must be a live member of THIS group.
      if (!members.some((m) => m.id === memberId && m.groupId === groupId && m.removedAt === null)) {
        throw new NotFoundException('Group not found');
      }
      if (expenses.some((e) => e.groupId === groupId && e.dto.clientRequestId === dto.clientRequestId)) return {};
      const g = groupOf(groupId);
      let amount = dto.amount;
      if (dto.currencyCode !== g.currencyCode) {
        if (!supported.includes(dto.currencyCode)) throw fxCode('CURRENCY_UNSUPPORTED', 'unsupported');
        const rate = rates[dto.currencyCode];
        if (rate === undefined) throw fxCode('FX_RATE_UNAVAILABLE', 'no rate');
        amount = Math.round(dto.amount * rate * 100) / 100;
      }
      expenses.push({ groupId, memberId, dto, amount });
      return {};
    },
  };

  const service = new GroupBotService(prisma as never, cache as never, groupsService as never);
  const draftKeys = () => [...cacheStore.keys()].filter((k) => !k.includes(':active:'));
  return { service, counters, draftKeys, groups, members, expenses, cacheStore, rates, addGroup, groupsService };
}

/** The draft id out of a callback id such as `gc:{id}`, `gc--{id}` or `gp:{id}:{n}`. */
export function draftIdOf(callbackId: string): string {
  const m = /([a-f0-9]{16})/.exec(callbackId);
  if (!m) throw new Error(`no draft id in ${callbackId}`);
  return m[1];
}

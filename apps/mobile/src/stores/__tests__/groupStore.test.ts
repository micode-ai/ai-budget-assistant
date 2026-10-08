jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1' }));
jest.mock('@/services/api', () => ({
  api: {
    listGroups: jest.fn(),
    getGroup: jest.fn(),
    getGroupActivity: jest.fn(),
    createGroupExpense: jest.fn(),
    createGroupSettlement: jest.fn(),
  },
}));

import { api } from '@/services/api';
import { useGroupStore } from '../groupStore';

const a = api as unknown as Record<string, jest.Mock>;
const detail = (v: number) => ({ id: 'g1', ledgerVersion: v, myMemberId: 'm1' }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  useGroupStore.getState().reset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  a.getGroupActivity.mockResolvedValue({ items: [], nextBefore: null });
});

describe('groupStore', () => {
  it('settle passes ledgerVersion and applies the result', async () => {
    useGroupStore.setState({ current: detail(3) });
    a.createGroupSettlement.mockResolvedValue(detail(4));
    const r = await useGroupStore
      .getState()
      .settle('g1', { fromMemberId: 'm1', toMemberId: 'm2', amount: 5 });
    expect(r).toEqual({ ok: true });
    expect(a.createGroupSettlement.mock.calls[0][1]).toMatchObject({ ledgerVersion: 3, clientRequestId: 'uuid-1' });
    expect(useGroupStore.getState().current).toEqual(detail(4));
  });

  it('settle on 409 LEDGER_CHANGED reloads and returns ledgerChanged', async () => {
    useGroupStore.setState({ current: detail(3) });
    a.createGroupSettlement.mockRejectedValue(Object.assign(new Error('c'), { status: 409, code: 'LEDGER_CHANGED' }));
    a.getGroup.mockResolvedValue(detail(5));
    const r = await useGroupStore
      .getState()
      .settle('g1', { fromMemberId: 'm1', toMemberId: 'm2', amount: 5 });
    expect(r).toEqual({ ok: false, reason: 'ledgerChanged' });
    expect(useGroupStore.getState().current).toEqual(detail(5));
    expect(useGroupStore.getState().error).toBeNull();
  });

  it('settle rethrows other errors and records them', async () => {
    useGroupStore.setState({ current: detail(3) });
    a.createGroupSettlement.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(
      useGroupStore.getState().settle('g1', { fromMemberId: 'm1', toMemberId: 'm2', amount: 5 }),
    ).rejects.toThrow('boom');
    expect(useGroupStore.getState().error).toBe('boom');
  });

  it('addExpense generates a clientRequestId; reset clears state', async () => {
    a.createGroupExpense.mockResolvedValue(detail(2));
    await useGroupStore.getState().addExpense('g1', {
      description: 'd',
      amount: 1,
      date: '2026-10-08',
      paidByMemberId: 'm1',
      splitType: 'equal',
      shares: [],
    });
    expect(a.createGroupExpense.mock.calls[0][1].clientRequestId).toBe('uuid-1');
    useGroupStore.getState().reset();
    expect(useGroupStore.getState().current).toBeNull();
  });
});

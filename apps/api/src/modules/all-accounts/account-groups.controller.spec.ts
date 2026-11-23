import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AccountGroupsController } from './account-groups.controller';
import { UpsertAccountGroupBody } from './dto/account-groups.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { SubscriptionTierGuard } from '../subscriptions/guards/subscription-tier.guard';
import { REQUIRED_TIER_KEY } from '../subscriptions/decorators/require-tier.decorator';

/* eslint-disable @typescript-eslint/no-explicit-any */

const guardsOf = (t: any): unknown[] => Reflect.getMetadata('__guards__', t) ?? [];

describe('AccountGroupsController', () => {
  it('is user-scoped: JwtAuthGuard, never AccountContextGuard', () => {
    expect(guardsOf(AccountGroupsController)).toContain(JwtAuthGuard);
    expect(guardsOf(AccountGroupsController)).not.toContain(AccountContextGuard);
  });

  it('every handler is Pro-gated with SubscriptionTierGuard', () => {
    const proto: any = AccountGroupsController.prototype;
    for (const name of ['list', 'create', 'update', 'remove', 'analytics']) {
      expect(Reflect.getMetadata(REQUIRED_TIER_KEY, proto[name])).toBe('pro');
      expect(guardsOf(proto[name])).toContain(SubscriptionTierGuard);
    }
  });

  it('analytics scopes to the resolved group accounts', async () => {
    const groups: any = { resolveAccountIds: jest.fn().mockResolvedValue(['a1']) };
    const all: any = { getAnalytics: jest.fn().mockResolvedValue({ ok: 1 }) };
    const c = new AccountGroupsController(groups, all);
    await c.analytics({ user: { id: 'u', currencyCode: '' } } as any, 'g1', '2026-11-01', '2026-11-30');
    expect(groups.resolveAccountIds).toHaveBeenCalledWith('u', 'g1');
    expect(all.getAnalytics).toHaveBeenCalledWith(
      { id: 'u', currencyCode: 'USD' },
      { start: '2026-11-01', end: '2026-11-30', exclude: [], onlyAccountIds: ['a1'], groupId: 'g1' },
    );
  });
});

describe('UpsertAccountGroupBody', () => {
  const errs = (o: object) => validateSync(plainToInstance(UpsertAccountGroupBody, o));
  const id = '11111111-1111-4111-8111-111111111111';
  it('accepts a valid body', () => expect(errs({ name: 'A', accountIds: [id] })).toHaveLength(0));
  it('rejects empty name, empty list, bad uuid, 101 ids, long name', () => {
    expect(errs({ name: '', accountIds: [id] }).length).toBeGreaterThan(0);
    expect(errs({ name: 'A', accountIds: [] }).length).toBeGreaterThan(0);
    expect(errs({ name: 'A', accountIds: ['x'] }).length).toBeGreaterThan(0);
    expect(errs({ name: 'A', accountIds: Array(101).fill(id) }).length).toBeGreaterThan(0);
    expect(errs({ name: 'x'.repeat(101), accountIds: [id] }).length).toBeGreaterThan(0);
  });
});

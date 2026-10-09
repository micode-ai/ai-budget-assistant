import 'reflect-metadata';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupsController } from './groups.controller';
import { GroupActiveGuard, GroupMemberGuard, GroupOwnerGuard } from './guards';

/**
 * `@Throttle` only sets metadata; with no APP_GUARD registered it is inert unless ThrottlerGuard is
 * actually applied. These routes are the brute-forceable ones (guessing a guest link / link code).
 */
describe('GroupsController throttling', () => {
  const proto = GroupsController.prototype as any;
  const guardsOf = (target: object): unknown[] => Reflect.getMetadata('__guards__', target) ?? [];

  it.each(['join', 'linkGuest'])('%s has ThrottlerGuard applied alongside its @Throttle limit', (name) => {
    expect(guardsOf(proto[name])).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto[name])).toBe(10);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', proto[name])).toBe(60000);
  });

  it('preview is throttled at 20/min with ThrottlerGuard applied, and declared before :groupId', () => {
    expect(guardsOf(proto.preview)).toContain(ThrottlerGuard);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.preview)).toBe(20);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', proto.preview)).toBe(60000);
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('preview')).toBeLessThan(names.indexOf('detail'));
  });

  it('keeps JwtAuthGuard at class level, so it runs before the throttler', () => {
    expect(guardsOf(GroupsController)).toEqual([JwtAuthGuard]);
  });

  it('does not change the other routes (no class-level ThrottlerGuard)', () => {
    expect(guardsOf(GroupsController)).not.toContain(ThrottlerGuard);
    expect(guardsOf(proto.list)).not.toContain(ThrottlerGuard);
  });

  it('transferOwner: throttled, owner-only and active-only (ABA-650)', () => {
    expect(guardsOf(proto.transferOwner)).toEqual([ThrottlerGuard, GroupMemberGuard, GroupOwnerGuard, GroupActiveGuard]);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.transferOwner)).toBe(10);
  });

  it('resetClaim: throttled, owner-only and active-only (ABA-651)', () => {
    expect(guardsOf(proto.resetClaim)).toEqual([ThrottlerGuard, GroupMemberGuard, GroupOwnerGuard, GroupActiveGuard]);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.resetClaim)).toBe(10);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', proto.resetClaim)).toBe(60000);
  });

  it('adopt: throttled, member and active guards, deliberately NOT owner-only (ABA-650)', () => {
    expect(guardsOf(proto.adopt)).toEqual([ThrottlerGuard, GroupMemberGuard, GroupActiveGuard]);
    expect(guardsOf(proto.adopt)).not.toContain(GroupOwnerGuard);
  });
});

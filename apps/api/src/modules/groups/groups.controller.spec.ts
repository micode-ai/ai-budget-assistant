import 'reflect-metadata';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupsController } from './groups.controller';

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

  it('keeps JwtAuthGuard at class level, so it runs before the throttler', () => {
    expect(guardsOf(GroupsController)).toEqual([JwtAuthGuard]);
  });

  it('does not change the other routes (no class-level ThrottlerGuard)', () => {
    expect(guardsOf(GroupsController)).not.toContain(ThrottlerGuard);
    expect(guardsOf(proto.list)).not.toContain(ThrottlerGuard);
  });
});

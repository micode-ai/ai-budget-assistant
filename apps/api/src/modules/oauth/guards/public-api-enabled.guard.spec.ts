import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublicApiEnabledGuard } from './public-api-enabled.guard';

const guard = (v?: string) =>
  new PublicApiEnabledGuard({ get: () => v } as unknown as ConfigService);

describe('PublicApiEnabledGuard', () => {
  it('404s when unset or false', () => {
    expect(() => guard(undefined).canActivate()).toThrow(NotFoundException);
    expect(() => guard('false').canActivate()).toThrow(NotFoundException);
  });
  it('passes on "TRUE "', () => {
    expect(guard('TRUE ').canActivate()).toBe(true);
  });
});

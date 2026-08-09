import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

const configService = { get: jest.fn().mockReturnValue('test-secret') } as any;

const activeUser = {
  id: 'u1',
  email: 'a@b.c',
  name: 'A',
  currencyCode: 'USD',
  defaultAccountId: 'acc-1',
  isActive: true,
};

describe('JwtStrategy.validate', () => {
  it('records activity for the authenticated user', async () => {
    const usersService = { findById: jest.fn().mockResolvedValue(activeUser) } as any;
    const lastActive = { touch: jest.fn().mockResolvedValue(undefined) } as any;
    const strategy = new JwtStrategy(configService, usersService, lastActive);

    const result = await strategy.validate({ sub: 'u1', email: 'a@b.c' });

    expect(lastActive.touch).toHaveBeenCalledWith('u1');
    expect(result.id).toBe('u1');
  });

  // Activity tracking is a side effect — a broken Redis/DB must not 401 the user.
  it('still authenticates when activity tracking rejects', async () => {
    const usersService = { findById: jest.fn().mockResolvedValue(activeUser) } as any;
    const lastActive = { touch: jest.fn().mockRejectedValue(new Error('redis down')) } as any;
    const strategy = new JwtStrategy(configService, usersService, lastActive);

    await expect(strategy.validate({ sub: 'u1', email: 'a@b.c' })).resolves.toMatchObject({ id: 'u1' });
  });

  it('does not record activity for a deactivated or missing user', async () => {
    const usersService = { findById: jest.fn().mockResolvedValue({ ...activeUser, isActive: false }) } as any;
    const lastActive = { touch: jest.fn() } as any;
    const strategy = new JwtStrategy(configService, usersService, lastActive);

    await expect(strategy.validate({ sub: 'u1', email: 'a@b.c' })).rejects.toThrow(UnauthorizedException);
    expect(lastActive.touch).not.toHaveBeenCalled();
  });
});

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AccountContextGuard } from './account-context.middleware';

const ctxFor = (req: any): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as ExecutionContext;

describe('AccountContextGuard', () => {
  const makeGuard = (membership: any) => {
    const prisma = { accountMember: { findUnique: jest.fn().mockResolvedValue(membership) } };
    return { guard: new AccountContextGuard(prisma as any), prisma };
  };

  it('puts the account anchor on the request', async () => {
    const { guard } = makeGuard({ role: 'owner', account: { monthAnchorDay: 10 } });
    const req: any = { user: { id: 'u1' }, headers: { 'x-account-id': 'a1' } };

    await guard.canActivate(ctxFor(req));

    expect(req.accountId).toBe('a1');
    expect(req.accountRole).toBe('owner');
    expect(req.monthAnchorDay).toBe(10);
  });

  it('exposes null when the account uses the calendar month', async () => {
    const { guard } = makeGuard({ role: 'editor', account: { monthAnchorDay: null } });
    const req: any = { user: { id: 'u1' }, headers: { 'x-account-id': 'a1' } };

    await guard.canActivate(ctxFor(req));

    expect(req.monthAnchorDay).toBeNull();
  });

  it('still rejects non-members', async () => {
    const { guard } = makeGuard(null);
    const req: any = { user: { id: 'u1' }, headers: { 'x-account-id': 'a1' } };

    await expect(guard.canActivate(ctxFor(req))).rejects.toThrow(ForbiddenException);
  });
});

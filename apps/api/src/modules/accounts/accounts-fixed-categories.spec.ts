import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';

describe('AccountsService.setCategoryFixed (ABA-777)', () => {
  function make(opts: { role?: string | null; category?: { id: string; clientId: string | null } | null; current?: string[] }) {
    const prisma: any = {
      accountMember: { findUnique: jest.fn().mockResolvedValue(opts.role === null ? null : { role: opts.role ?? 'editor' }) },
      category: { findFirst: jest.fn().mockResolvedValue(opts.category === undefined ? { id: 'srv-1', clientId: 'local-1' } : opts.category) },
      account: {
        findUnique: jest.fn().mockResolvedValue({ fixedCategoryIds: opts.current ?? [] }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return { service: new AccountsService(prisma, {} as any, {} as any), prisma };
  }

  it('marks a category under every id it is known by, resolving a device id', async () => {
    const { service, prisma } = make({ current: ['other'] });
    const res = await service.setCategoryFixed('acc-1', 'u-1', 'local-1', true);
    expect(res).toEqual({ fixedCategoryIds: ['other', 'local-1', 'srv-1'] });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        type: 'expense',
        AND: [
          { OR: [{ accountId: 'acc-1' }, { accountId: null }] },
          { OR: [{ id: 'local-1' }, { clientId: 'local-1' }] },
        ],
      },
      select: { id: true, clientId: true },
    });
  });

  it('unmarks every spelling, whichever id the request used', async () => {
    const { service } = make({ current: ['local-1', 'srv-1', 'other'] });
    expect(await service.setCategoryFixed('acc-1', 'u-1', 'srv-1', false)).toEqual({ fixedCategoryIds: ['other'] });
  });

  it('marking twice does not duplicate', async () => {
    const { service } = make({ current: ['local-1', 'srv-1'] });
    expect((await service.setCategoryFixed('acc-1', 'u-1', 'srv-1', true)).fixedCategoryIds).toEqual(['local-1', 'srv-1']);
  });

  it('404s a category the account cannot see or that is not an expense category', async () => {
    const { service } = make({ category: null });
    await expect(service.setCategoryFixed('acc-1', 'u-1', 'x', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a viewer', async () => {
    const { service } = make({ role: 'viewer' });
    await expect(service.setCategoryFixed('acc-1', 'u-1', 'srv-1', true)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

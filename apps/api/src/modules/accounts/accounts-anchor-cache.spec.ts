import { AccountsService } from './accounts.service';

describe('AccountsService.update — month anchor busts cached month figures (ABA-793)', () => {
  function make() {
    const prisma: any = {
      accountMember: { findUnique: jest.fn().mockResolvedValue({ role: 'owner' }) },
      account: { update: jest.fn().mockResolvedValue({ id: 'acc-1' }) },
    };
    const cache: any = { delByPrefix: jest.fn().mockResolvedValue(undefined), del: jest.fn().mockResolvedValue(undefined) };
    return { service: new AccountsService(prisma, {} as any, {} as any, cache), cache };
  }

  it('drops Safe-to-Spend and the chat summary when the anchor day changes', async () => {
    const { service, cache } = make();
    await service.update('acc-1', 'u-1', { monthAnchorDay: 10 } as any);
    expect(cache.delByPrefix).toHaveBeenCalledWith('sts:acc-1:');
    expect(cache.del).toHaveBeenCalledWith('uc:acc-1');
  });

  it('also when the anchor is cleared back to the calendar month', async () => {
    const { service, cache } = make();
    await service.update('acc-1', 'u-1', { monthAnchorDay: null } as any);
    expect(cache.delByPrefix).toHaveBeenCalledWith('sts:acc-1:');
  });

  it('leaves the caches alone for an update that does not touch the anchor', async () => {
    const { service, cache } = make();
    await service.update('acc-1', 'u-1', { name: 'Home' } as any);
    expect(cache.delByPrefix).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();
  });
});

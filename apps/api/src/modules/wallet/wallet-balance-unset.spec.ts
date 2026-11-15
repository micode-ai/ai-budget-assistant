import { WalletService } from './wallet.service';

describe('WalletService.isBalanceUnset', () => {
  function make(setRows: number, adjustments: number) {
    const prisma: any = {
      walletBalance: { count: jest.fn().mockResolvedValue(setRows) },
      walletAdjustment: { count: jest.fn().mockResolvedValue(adjustments) },
    };
    return { service: new WalletService(prisma), prisma };
  }

  it('is unset with no non-zero starting balance and no correction', async () => {
    const { service, prisma } = make(0, 0);
    expect(await service.isBalanceUnset('a1')).toBe(true);
    expect(prisma.walletBalance.count).toHaveBeenCalledWith({
      where: { accountId: 'a1', isDeleted: false, NOT: { initialAmount: 0 } },
    });
  });

  it('is set once any currency has a starting balance or any correction exists', async () => {
    expect(await make(1, 0).service.isBalanceUnset('a1')).toBe(false);
    expect(await make(0, 2).service.isBalanceUnset('a1')).toBe(false);
  });
});

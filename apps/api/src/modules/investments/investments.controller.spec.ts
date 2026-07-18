import { InvestmentsController } from './investments.controller';

function makeReq(overrides: any = {}) {
  return { accountId: 'acc-1', user: { id: 'u1' }, ...overrides } as any;
}

describe('InvestmentsController', () => {
  function makeController() {
    const investmentsService = {
      searchAssets: jest.fn().mockResolvedValue([]),
      getHoldings: jest.fn().mockResolvedValue([]),
      createHolding: jest.fn().mockResolvedValue({ id: 'h-1' }),
      removeHolding: jest.fn().mockResolvedValue({ success: true }),
      getTransactions: jest.fn().mockResolvedValue([]),
      createTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      updateTransaction: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      removeTransaction: jest.fn().mockResolvedValue({ success: true }),
      getPortfolioSummary: jest.fn().mockResolvedValue({ summary: {} }),
      getPortfolioAnalytics: jest.fn().mockResolvedValue({ performance: {} }),
      getAssetPriceHistory: jest.fn().mockResolvedValue({ dates: [], prices: [] }),
      refreshPrices: jest.fn().mockResolvedValue({ success: true }),
    } as any;
    const investmentInsightsService = {
      getInvestmentInsights: jest.fn().mockResolvedValue({ insights: [] }),
    } as any;
    const controller = new InvestmentsController(investmentsService, investmentInsightsService);
    return { controller, investmentsService, investmentInsightsService };
  }

  it('scopes every read/write call to req.accountId (and req.user.id where relevant)', async () => {
    const { controller, investmentsService } = makeController();
    const req = makeReq();

    await controller.getHoldings(req);
    expect(investmentsService.getHoldings).toHaveBeenCalledWith('acc-1');

    await controller.createHolding(req, { localId: 'l1' } as any);
    expect(investmentsService.createHolding).toHaveBeenCalledWith('acc-1', 'u1', { localId: 'l1' });

    await controller.removeHolding(req, 'h-1');
    expect(investmentsService.removeHolding).toHaveBeenCalledWith('acc-1', 'h-1');

    await controller.createTransaction(req, { holdingId: 'h-1' } as any);
    expect(investmentsService.createTransaction).toHaveBeenCalledWith('acc-1', 'u1', { holdingId: 'h-1' });

    await controller.refreshPrices(req);
    expect(investmentsService.refreshPrices).toHaveBeenCalledWith('acc-1');
  });

  it('defaults asset search query to an empty string when q is missing', async () => {
    const { controller, investmentsService } = makeController();

    await controller.searchAssets(undefined as any);

    expect(investmentsService.searchAssets).toHaveBeenCalledWith('');
  });

  it('parses the days query param for price history, defaulting to 30', async () => {
    const { controller, investmentsService } = makeController();
    const req = makeReq();

    await controller.getAssetPriceHistory(req, 'h-1', '90');
    expect(investmentsService.getAssetPriceHistory).toHaveBeenCalledWith('acc-1', 'h-1', 90);

    await controller.getAssetPriceHistory(req, 'h-1', undefined);
    expect(investmentsService.getAssetPriceHistory).toHaveBeenCalledWith('acc-1', 'h-1', 30);
  });

  it('threads the requesting user id into the AI insights call', async () => {
    const { controller, investmentInsightsService } = makeController();
    const req = makeReq({ user: { id: 'u2' } });

    await controller.getInvestmentInsights(req, 'pl');

    expect(investmentInsightsService.getInvestmentInsights).toHaveBeenCalledWith('acc-1', 'pl', 'u2');
  });
});

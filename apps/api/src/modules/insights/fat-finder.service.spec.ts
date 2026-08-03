import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FatFinderService } from './fat-finder.service';
import { PrismaService } from '../../database/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';

const mockChatCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

function buildDeps() {
  const prisma: any = {
    account: { findUnique: jest.fn().mockResolvedValue({ encryptionTier: 0 }) },
    fatFinderReport: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    user: { findUnique: jest.fn().mockResolvedValue({ aiResponseMode: 'balanced', aiModel: null }) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const subscriptionsService = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
  const exchangeRateService = {
    getRates: jest.fn().mockResolvedValue({ base: 'USD', rates: { USD: 1, EUR: 0.9, PLN: 4 }, updatedAt: '' }),
  };
  return { prisma, subscriptionsService, exchangeRateService };
}

/** The prompt text sent to OpenAI on the first (only) call. */
function promptSent() {
  return mockChatCreate.mock.calls[0][0].messages[0].content as string;
}

function expenseRow(over: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    amount: '50' as any,
    currencyCode: 'USD',
    description: 'Netflix',
    date: new Date(2026, 6, 10),
    category: { name: 'Subscriptions' },
    expenseTags: [],
    ...over,
  };
}

describe('FatFinderService', () => {
  let service: FatFinderService;
  let deps: ReturnType<typeof buildDeps>;

  beforeEach(async () => {
    mockChatCreate.mockReset();
    deps = buildDeps();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FatFinderService,
        { provide: ConfigService, useValue: { get: () => 'sk-test' } },
        { provide: PrismaService, useValue: deps.prisma },
        { provide: SubscriptionsService, useValue: deps.subscriptionsService },
        { provide: ExchangeRateService, useValue: deps.exchangeRateService },
      ],
    }).compile();
    service = moduleRef.get(FatFinderService);
  });

  describe('encryption gate', () => {
    it('returns encryptionRestricted with an empty report when full E2E encryption is on', async () => {
      deps.prisma.account.findUnique.mockResolvedValueOnce({ encryptionTier: 2 });
      const res = await service.generateReport('acc-1', 'en', false, 'user-1', 7, 2026);
      expect(res.encryptionRestricted).toBe(true);
      expect(res.report.findings).toEqual([]);
      expect(mockChatCreate).not.toHaveBeenCalled();
    });
  });

  describe('no expenses in range', () => {
    it('returns an empty report without calling OpenAI when there is nothing to analyze', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([]);
      // forceRegenerate=true skips the cache lookup; no userId skips the response-mode lookup.
      const res = await service.generateReport('acc-1', 'en', true, undefined, 7, 2026);
      expect(res.report.findings).toEqual([]);
      expect(res.report.totalPotentialSavings).toBe(0);
      expect(mockChatCreate).not.toHaveBeenCalled();
    });
  });

  describe('cache hit', () => {
    it('returns the cached report without calling OpenAI', async () => {
      const cached = {
        id: 'r0',
        accountId: 'acc-1',
        periodStart: new Date(2026, 6, 1),
        periodEnd: new Date(2026, 7, 0),
        findings: [{ id: 'ff-1', type: 'subscription', title: 'Cached' }],
        totalSavings: 12.5,
        currencyCode: 'USD',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date('2026-07-10T00:00:00Z'),
      };
      deps.prisma.fatFinderReport.findUnique.mockResolvedValueOnce(cached);

      const res = await service.generateReport('acc-1', 'en', false, 'user-1', 7, 2026);
      expect(res.report.id).toBe('r0');
      expect(res.report.totalPotentialSavings).toBe(12.5);
      expect(mockChatCreate).not.toHaveBeenCalled();
      expect(deps.prisma.expense.findMany).not.toHaveBeenCalled();
    });
  });

  describe('generation — happy path / mobile "Track this" pre-fill shape', () => {
    it('parses findings JSON, persists via upsert, and tracks AI usage', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([expenseRow()]);

      const subscriptionFinding = {
        type: 'subscription',
        title: 'Netflix subscription',
        description: 'You pay $50/mo for Netflix.',
        currentMonthly: 50,
        suggestedMonthly: 0,
        potentialSavings: 50,
        severity: 'medium',
        actionSuggestion: 'Cancel it if unused.',
        relatedExpenses: [{ description: 'Netflix', amount: 50, date: '2026-07-10' }],
      };

      mockChatCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({ findings: [subscriptionFinding], totalPotentialSavings: 50 }),
            },
          },
        ],
      });

      deps.prisma.fatFinderReport.upsert.mockResolvedValueOnce({
        id: 'r1',
        accountId: 'acc-1',
        periodStart: new Date(2026, 6, 1),
        periodEnd: new Date(2026, 7, 0),
        findings: [{ id: 'ff-123', ...subscriptionFinding }],
        totalSavings: 50,
        currencyCode: 'USD',
        createdAt: new Date('2026-07-18T00:00:00Z'),
      });

      const res = await service.generateReport('acc-1', 'en', true, 'user-1', 7, 2026);

      expect(mockChatCreate).toHaveBeenCalledTimes(1);
      expect(res.report.totalPotentialSavings).toBe(50);
      // Shape consumed by the mobile "Track this" pre-fill (subscriptions/new.tsx router params).
      expect(res.report.findings[0]).toMatchObject({
        type: 'subscription',
        title: 'Netflix subscription',
        currentMonthly: 50,
        suggestedMonthly: 0,
        potentialSavings: 50,
      });
      expect(res.report.findings[0].id).toBeDefined();
      // aiModel null => balanced multiplier (1.0) => cost stays 3.0
      expect(deps.subscriptionsService.trackAiUsage).toHaveBeenCalledWith('user-1', 'fat_finder', 3.0, 'acc-1');
    });
  });

  describe('malformed OpenAI response', () => {
    it('degrades to an empty findings list when the model returns non-JSON content', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([expenseRow()]);
      mockChatCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'not valid json' } }] });

      deps.prisma.fatFinderReport.upsert.mockResolvedValueOnce({
        id: 'r2',
        accountId: 'acc-1',
        periodStart: new Date(2026, 6, 1),
        periodEnd: new Date(2026, 7, 0),
        findings: [],
        totalSavings: 0,
        currencyCode: 'USD',
        createdAt: new Date('2026-07-18T00:00:00Z'),
      });

      const res = await service.generateReport('acc-1', 'en', true, 'user-1', 7, 2026);
      expect(res.report.findings).toEqual([]);
      expect(res.report.totalPotentialSavings).toBe(0);
      expect(deps.prisma.fatFinderReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ findings: [], totalSavings: 0 }) }),
      );
      // Usage is still tracked — the OpenAI call itself succeeded, only parsing failed.
      expect(deps.subscriptionsService.trackAiUsage).toHaveBeenCalled();
    });
  });

  describe('OpenAI call failure', () => {
    it('returns an empty fallback report and does not track usage when the OpenAI call throws', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([expenseRow()]);
      mockChatCreate.mockRejectedValueOnce(new Error('rate limited'));

      const res = await service.generateReport('acc-1', 'en', true, 'user-1', 7, 2026);
      expect(res.report.findings).toEqual([]);
      expect(res.report.totalPotentialSavings).toBe(0);
      expect(res.report.currencyCode).toBe('USD');
      expect(res.isStale).toBe(false);
      expect(deps.prisma.fatFinderReport.upsert).not.toHaveBeenCalled();
      expect(deps.subscriptionsService.trackAiUsage).not.toHaveBeenCalled();
    });
  });

  // ABA-386: the report used to be labelled with expenses[0].currencyCode — the
  // *newest* row's currency — so a single small USD charge in a PLN account made
  // the whole audit read in dollars, with PLN+EUR+USD amounts summed blind.
  describe('display currency / FX conversion', () => {
    it('labels the report in the caller display currency and converts every amount into it', async () => {
      // Newest row first (mirrors orderBy date desc): a small USD charge in a PLN account.
      deps.prisma.expense.findMany.mockResolvedValueOnce([
        expenseRow({ id: 'e-usd', amount: '10', currencyCode: 'USD', date: new Date(2026, 6, 25), description: 'Claude' }),
        expenseRow({ id: 'e-pln', amount: '100', currencyCode: 'PLN', date: new Date(2026, 6, 20), description: 'Biedronka' }),
      ]);
      // 1 PLN = 0.25 USD => 10 USD = 40 PLN
      deps.exchangeRateService.getRates.mockResolvedValueOnce({ base: 'PLN', rates: { PLN: 1, USD: 0.25, EUR: 0.23 }, updatedAt: '' });
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ findings: [], totalPotentialSavings: 0 }) } }],
      });
      deps.prisma.fatFinderReport.upsert.mockImplementationOnce(({ create }: any) => ({
        ...create,
        id: 'r-pln',
        createdAt: new Date('2026-07-26T00:00:00Z'),
      }));

      const res = await service.generateReport('acc-1', 'ru', true, 'user-1', 7, 2026, 'PLN');

      expect(res.report.currencyCode).toBe('PLN');
      expect(deps.exchangeRateService.getRates).toHaveBeenCalledWith('PLN');
      // 100 PLN + (10 USD -> 40 PLN) = 140 PLN, and nothing is labelled USD.
      expect(promptSent()).toContain('140.00 PLN');
      expect(promptSent()).not.toContain('USD');
      expect(deps.prisma.fatFinderReport.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ currencyCode: 'PLN' }) }),
      );
    });

    it('regenerates instead of serving a cached report that is in another currency', async () => {
      deps.prisma.fatFinderReport.findUnique.mockResolvedValueOnce({
        id: 'r-stale-usd',
        accountId: 'acc-1',
        periodStart: new Date(2026, 6, 1),
        periodEnd: new Date(2026, 7, 0),
        findings: [{ id: 'ff-1', type: 'subscription', title: 'Cached in dollars' }],
        totalSavings: 1267.51,
        currencyCode: 'USD',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date('2026-08-03T00:00:00Z'),
      });
      deps.prisma.expense.findMany.mockResolvedValueOnce([]);

      const res = await service.generateReport('acc-1', 'ru', false, 'user-1', 7, 2026, 'PLN');

      expect(deps.prisma.expense.findMany).toHaveBeenCalled();
      expect(res.report.id).not.toBe('r-stale-usd');
      expect(res.report.currencyCode).toBe('PLN');
    });

    it('excludes amounts with no known rate and reports fxApproximate', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([
        expenseRow({ id: 'e-gbp', amount: '20', currencyCode: 'GBP', date: new Date(2026, 6, 25) }),
        expenseRow({ id: 'e-pln', amount: '100', currencyCode: 'PLN', date: new Date(2026, 6, 20) }),
      ]);
      deps.exchangeRateService.getRates.mockResolvedValueOnce({ base: 'PLN', rates: { PLN: 1, USD: 0.25 }, updatedAt: '' });
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ findings: [], totalPotentialSavings: 0 }) } }],
      });
      deps.prisma.fatFinderReport.upsert.mockImplementationOnce(({ create }: any) => ({
        ...create,
        id: 'r-approx',
        createdAt: new Date('2026-07-26T00:00:00Z'),
      }));

      const res = await service.generateReport('acc-1', 'en', true, 'user-1', 7, 2026, 'PLN');

      expect(res.fxApproximate).toBe(true);
      expect(promptSent()).toContain('100.00 PLN');
      expect(promptSent()).not.toContain('GBP');
    });

    it('skips the rate lookup entirely when every expense is already in the display currency', async () => {
      deps.prisma.expense.findMany.mockResolvedValueOnce([
        expenseRow({ id: 'e-pln', amount: '100', currencyCode: 'PLN', date: new Date(2026, 6, 20) }),
      ]);
      mockChatCreate.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ findings: [], totalPotentialSavings: 0 }) } }],
      });
      deps.prisma.fatFinderReport.upsert.mockImplementationOnce(({ create }: any) => ({
        ...create,
        id: 'r-single',
        createdAt: new Date('2026-07-26T00:00:00Z'),
      }));

      const res = await service.generateReport('acc-1', 'en', true, 'user-1', 7, 2026, 'PLN');

      expect(deps.exchangeRateService.getRates).not.toHaveBeenCalled();
      expect(res.fxApproximate).toBeFalsy();
      expect(res.report.currencyCode).toBe('PLN');
    });
  });
});

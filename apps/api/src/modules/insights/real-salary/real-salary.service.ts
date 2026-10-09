import { Injectable } from '@nestjs/common';
import type {
  CoicopDivision, RealSalaryCategoryRow, RealSalaryProfileResponse, RealSalaryResponse,
  RealSalaryStatus, SalaryProfileDto,
} from '@budget/shared-types';
import { PrismaService } from '../../../database/prisma.service';
import { CacheService } from '../../../common/cache/cache.service';
import { ExchangeRateService } from '../../currency-exchange/exchange-rate.service';
import { PriceHistoryService } from '../../price-history/price-history.service';
import { convertAmount, getRatesSafe } from '../../../common/utils/fx';
import { attributeToCategories } from '../../../common/utils/category-attribution';
import { countryFromTimezone, isDivision, isEurostatCountry } from './coicop';
import { annualiseHalfYearPct, computePersonalInflation, realChange, type SpendByDivision } from './real-salary.util';
import { findSalaryCandidates, nominalChange, type IncomeRow } from './salary-detect.util';
import { OfficialInflationService } from './official-inflation.service';
import { CoicopClassifierService } from './coicop-classifier.service';

const CACHE_TTL_SEC = 3600;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SPEND_MONTHS = 3;

export function realSalaryCacheKey(accountId: string, userId: string, currency: string): string {
  return `rs:${accountId}:${userId}:${currency}`;
}

@Injectable()
export class RealSalaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly priceHistory: PriceHistoryService,
    private readonly official: OfficialInflationService,
    private readonly classifier: CoicopClassifierService,
  ) {}

  async compute(accountId: string, userId: string, baseCurrency: string): Promise<RealSalaryResponse> {
    const now = new Date();
    const empty = (status: RealSalaryStatus, extra: Partial<RealSalaryResponse> = {}): RealSalaryResponse => ({
      status, baseCurrency, country: null, countryGuessed: false, dataMonth: null,
      nominalChangePct: null, personalInflationPct: null, realChangePct: null, requiredRaisePct: null,
      breakdown: [], topDrivers: [], fxApproximate: false, computedAt: now.toISOString(), ...extra,
    });

    // Encryption must be checked BEFORE the cache read: a tier-2 account must
    // never be served a cached pre-encryption answer computed before the
    // account was encrypted.
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { encryptionTier: true } });
    if ((account?.encryptionTier ?? 0) >= 2) return empty('encrypted');

    // Cache is keyed per (account, user, currency): the answer depends on the
    // CALLER's own SalaryProfile and country, so one member's answer must
    // never be served to another member of the same shared account.
    const key = realSalaryCacheKey(accountId, userId, baseCurrency);
    const cached = await this.cache.get<RealSalaryResponse>(key);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id: userId }, select: { timezone: true, inflationCountry: true },
    });
    const explicit = isEurostatCountry(user?.inflationCountry) ? user!.inflationCountry! : null;
    const country = explicit ?? countryFromTimezone(user?.timezone);
    // One rule for every status: `country` is the resolved country (explicit,
    // else the timezone guess, else null) even when no official data exists for
    // it — a receipts-only answer is recognisable by `dataMonth: null`.
    const countryGuessed = !explicit && country !== null;

    const rates = await getRatesSafe(this.exchangeRateService, baseCurrency);
    const convert = (amount: number, from: string) => convertAmount(amount, from, baseCurrency, rates);

    // ── salary ────────────────────────────────────────────────────────────
    const profile = await this.prisma.salaryProfile.findUnique({
      where: { userId_accountId: { userId, accountId } },
      select: { salaryKey: true, manualPreviousMonthly: true },
    });
    if (!profile?.salaryKey) return empty('no_salary_confirmed', { country, countryGuessed });

    const incomes = await this.loadIncomes(userId, new Date(now.getTime() - 2 * 366 * DAY_MS));
    const nominal = nominalChange({
      rows: incomes, salaryKey: profile.salaryKey, now,
      manualPreviousMonthly: profile.manualPreviousMonthly === null ? null : Number(profile.manualPreviousMonthly),
    });
    if (nominal.nominalChangePct === null) {
      return empty('salary_history_short', { country, countryGuessed });
    }

    // ── spend weights ─────────────────────────────────────────────────────
    await this.classifier.ensureClassified(accountId);
    const { spend, months, fxApproximate: spendFx } = await this.loadSpend(accountId, now, convert);
    if (months < MIN_SPEND_MONTHS) return empty('spend_under_3_months', { country, countryGuessed });

    // ── inflation ─────────────────────────────────────────────────────────
    const officialData = country ? await this.official.latestFor(country) : null;
    const receipt = await this.priceHistory.getPriceHistory(accountId, '12m');
    const inflation = computePersonalInflation({
      spend,
      officialRates: officialData?.rates ?? {},
      receiptIndexPct: annualiseHalfYearPct(receipt.inflationIndex),
      receiptProductCount: receipt.productCount,
    });
    const fxApproximate = spendFx;
    if (!inflation) {
      return empty('no_inflation_source', { country, countryGuessed, fxApproximate });
    }

    const change = realChange(nominal.nominalChangePct, inflation.inflationPct);
    const result: RealSalaryResponse = {
      status: 'ready',
      baseCurrency,
      country,
      countryGuessed,
      dataMonth: officialData?.month ?? null,
      nominalChangePct: nominal.nominalChangePct,
      personalInflationPct: inflation.inflationPct,
      realChangePct: change.realChangePct,
      requiredRaisePct: change.requiredRaisePct,
      breakdown: inflation.breakdown,
      topDrivers: inflation.topDrivers,
      fxApproximate,
      computedAt: now.toISOString(),
    };
    await this.cache.set(key, result, CACHE_TTL_SEC);
    return result;
  }

  async getProfile(accountId: string, userId: string): Promise<RealSalaryProfileResponse> {
    const profile = await this.prisma.salaryProfile.findUnique({
      where: { userId_accountId: { userId, accountId } },
      select: { salaryKey: true, manualPreviousMonthly: true },
    });
    const now = new Date();
    const incomes = await this.loadIncomes(userId, new Date(now.getTime() - 120 * DAY_MS));
    return {
      profile: {
        salaryKey: profile?.salaryKey ?? null,
        manualPreviousMonthly: profile?.manualPreviousMonthly == null ? null : Number(profile.manualPreviousMonthly),
      },
      candidates: findSalaryCandidates(incomes, now),
    };
  }

  async saveProfile(accountId: string, userId: string, dto: SalaryProfileDto): Promise<SalaryProfileDto> {
    const data = { salaryKey: dto.salaryKey, manualPreviousMonthly: dto.manualPreviousMonthly };
    const saved = await this.prisma.salaryProfile.upsert({
      where: { userId_accountId: { userId, accountId } },
      create: { userId, accountId, ...data },
      update: data,
    });
    await this.bustAccount(accountId);
    return {
      salaryKey: saved.salaryKey ?? null,
      manualPreviousMonthly: saved.manualPreviousMonthly == null ? null : Number(saved.manualPreviousMonthly),
    };
  }

  /**
   * The settings screen's category list, each with its spend over the SAME
   * 12-month window and filters `compute()` weighs, so the user can see which
   * unassigned categories actually move the answer (ABA-617).
   */
  async listCategories(accountId: string, baseCurrency: string): Promise<RealSalaryCategoryRow[]> {
    await this.classifier.ensureClassified(accountId);
    const rows = await this.prisma.category.findMany({
      where: { accountId, type: 'expense', isDeleted: false },
      select: { id: true, name: true, icon: true, coicopDivision: true },
      orderBy: { name: 'asc' },
    });
    const rates = await getRatesSafe(this.exchangeRateService, baseCurrency);
    const { parts } = await this.loadSpendParts(accountId, new Date(), (a, c) => convertAmount(a, c, baseCurrency, rates));
    const byCategory = new Map<string, number>();
    for (const p of parts) {
      if (p.categoryId) byCategory.set(p.categoryId, (byCategory.get(p.categoryId) ?? 0) + p.amount);
    }
    return rows.map((r: { id: string; name: string; icon: string | null; coicopDivision: string | null }) => ({
      id: r.id, name: r.name, icon: r.icon, coicopDivision: isDivision(r.coicopDivision) ? r.coicopDivision : null,
      spend: Math.round((byCategory.get(r.id) ?? 0) * 100) / 100,
      spendCurrency: baseCurrency,
    }));
  }

  async bustAccount(accountId: string): Promise<void> {
    await this.cache.delByPrefix(`rs:${accountId}:`);
  }

  /**
   * Salary is the caller's own, not the open account's: it is often paid into
   * a personal account and moved to a shared one by transfer, which is not an
   * income there. So read the incomes THIS user recorded in every account they
   * are still an active member of (a left or deleted account drops out), and
   * never from a fully-encrypted one, whose descriptions are ciphertext.
   * Spend stays the open account's — that is what the salary is spent on.
   */
  private async loadIncomes(userId: string, since: Date): Promise<IncomeRow[]> {
    const rows = await this.prisma.income.findMany({
      where: {
        userId,
        isDeleted: false,
        isSplitReceivable: false,
        date: { gte: since },
        account: { isActive: true, encryptionTier: { lt: 2 }, members: { some: { userId } } },
      },
      select: {
        amount: true, currencyCode: true, date: true, description: true, categoryId: true,
        category: { select: { name: true } }, isDebt: true, isDebtRepayment: true, clientId: true,
      },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({
      amount: Number(r.amount), currencyCode: r.currencyCode, date: new Date(r.date),
      description: r.description ?? null, categoryId: r.categoryId ?? null, categoryName: r.category?.name ?? null,
      isDebt: r.isDebt, isDebtRepayment: r.isDebtRepayment, clientId: r.clientId,
    }));
  }

  private async loadSpend(
    accountId: string, now: Date, convert: (a: number, c: string) => number | null,
  ): Promise<{ spend: SpendByDivision[]; months: number; fxApproximate: boolean }> {
    const { parts, months, fxApproximate } = await this.loadSpendParts(accountId, now, convert);
    const spend = parts.map((p) => ({ division: p.division, amount: p.amount }));
    return { spend, months, fxApproximate };
  }

  /**
   * The spend real salary weighs: the open account's last 365 days, excluding
   * debts, repayments, planned expenses and split-receivables, attributed to
   * categories by the one split rule and converted to the base currency (an
   * unknown rate drops the amount and flags fxApproximate). Shared by the
   * weights and the settings list so both read the same money.
   */
  private async loadSpendParts(
    accountId: string, now: Date, convert: (a: number, c: string) => number | null,
  ): Promise<{ parts: { categoryId: string | null; division: CoicopDivision; amount: number }[]; months: number; fxApproximate: boolean }> {
    const rows = await this.prisma.expense.findMany({
      where: {
        accountId, isDeleted: false, isDebt: false, isDebtRepayment: false, isPlanned: false,
        isSplitReceivable: false, date: { gte: new Date(now.getTime() - 365 * DAY_MS) },
      },
      select: {
        amount: true, currencyCode: true, date: true, categoryId: true,
        category: { select: { id: true, name: true, coicopDivision: true } },
        categorySplits: {
          where: { isDeleted: false },
          select: { categoryId: true, amount: true, category: { select: { id: true, name: true, coicopDivision: true } } },
        },
      },
    });

    const divisionOf = new Map<string, CoicopDivision>();
    const months = new Set<string>();
    const parts: { categoryId: string | null; division: CoicopDivision; amount: number }[] = [];
    let fxApproximate = false;
    for (const e of rows) {
      const d = new Date(e.date);
      months.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
      if (e.category?.id && isDivision(e.category.coicopDivision)) divisionOf.set(e.category.id, e.category.coicopDivision);
      for (const s of e.categorySplits ?? []) {
        if (s.category?.id && isDivision(s.category.coicopDivision)) divisionOf.set(s.category.id, s.category.coicopDivision);
      }
      for (const part of attributeToCategories(e)) {
        const v = convert(part.amount, e.currencyCode);
        if (v === null) { fxApproximate = true; continue; }
        const division = (part.categoryId && divisionOf.get(part.categoryId)) || 'TOTAL';
        parts.push({ categoryId: part.categoryId ?? null, division, amount: v });
      }
    }
    return { parts, months: months.size, fxApproximate };
  }
}

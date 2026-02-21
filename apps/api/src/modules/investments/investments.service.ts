import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TwelveDataService } from './twelve-data.service';
import {
  CreatePortfolioHoldingDto,
  CreateInvestmentTransactionDto,
  UpdateInvestmentTransactionDto,
  PortfolioAnalyticsRequestDto,
} from './dto';

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly twelveData: TwelveDataService,
  ) {}

  // ---- Asset Search ----

  async searchAssets(query: string) {
    return this.twelveData.searchAssets(query);
  }

  // ---- Holdings ----

  async getHoldings(accountId: string) {
    return this.prisma.portfolioHolding.findMany({
      where: { accountId, isDeleted: false },
      include: { asset: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createHolding(
    accountId: string,
    userId: string,
    dto: CreatePortfolioHoldingDto,
  ) {
    // Find or create the asset
    const asset = await this.findOrCreateAsset(
      dto.assetSymbol.toUpperCase(),
      dto.assetName,
      dto.assetType,
      dto.assetExchange,
      dto.assetCurrency,
    );

    // Check if holding already exists for this account+asset
    const existing = await this.prisma.portfolioHolding.findUnique({
      where: { accountId_assetId: { accountId, assetId: asset.id } },
    });

    if (existing && !existing.isDeleted) {
      throw new BadRequestException('Holding for this asset already exists');
    }

    // Reactivate if soft-deleted, otherwise create
    if (existing) {
      return this.prisma.portfolioHolding.update({
        where: { id: existing.id },
        data: {
          isDeleted: false,
          notes: dto.notes,
          syncVersion: { increment: 1 },
        },
        include: { asset: true },
      });
    }

    return this.prisma.portfolioHolding.create({
      data: {
        accountId,
        userId,
        clientId: dto.localId,
        assetId: asset.id,
        notes: dto.notes,
      },
      include: { asset: true },
    });
  }

  async removeHolding(accountId: string, holdingId: string) {
    const holding = await this.prisma.portfolioHolding.findFirst({
      where: { id: holdingId, accountId, isDeleted: false },
    });

    if (!holding) {
      throw new NotFoundException('Holding not found');
    }

    await this.prisma.$transaction([
      // Soft-delete all transactions for this holding
      this.prisma.investmentTransaction.updateMany({
        where: { holdingId, isDeleted: false },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      }),
      // Soft-delete the holding
      this.prisma.portfolioHolding.update({
        where: { id: holdingId },
        data: {
          isDeleted: true,
          quantity: 0,
          totalInvested: 0,
          syncVersion: { increment: 1 },
        },
      }),
    ]);

    return { success: true };
  }

  // ---- Transactions ----

  async getTransactions(accountId: string, holdingId?: string) {
    const where: Record<string, unknown> = { accountId, isDeleted: false };
    if (holdingId) where.holdingId = holdingId;

    return this.prisma.investmentTransaction.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async createTransaction(
    accountId: string,
    userId: string,
    dto: CreateInvestmentTransactionDto,
  ) {
    // Validate holding exists
    const holding = await this.prisma.portfolioHolding.findFirst({
      where: { id: dto.holdingId, accountId, isDeleted: false },
    });

    if (!holding) {
      throw new NotFoundException('Holding not found');
    }

    // For sell transactions, validate sufficient quantity
    if (dto.type === 'sell') {
      const currentQty = Number(holding.quantity);
      if (dto.quantity > currentQty) {
        throw new BadRequestException(
          `Cannot sell ${dto.quantity} units. Only ${currentQty} available.`,
        );
      }
    }

    const totalAmount = dto.quantity * dto.pricePerUnit;
    const fee = dto.fee || 0;

    // Check if transaction already exists (idempotent sync)
    const existing = await this.prisma.investmentTransaction.findFirst({
      where: { accountId, clientId: dto.localId },
    });

    if (existing) {
      // Already synced — still recalculate in case holding was reset
      await this.recalculateHolding(dto.holdingId);
      return existing;
    }

    const transaction = await this.prisma.investmentTransaction.create({
      data: {
        holdingId: dto.holdingId,
        accountId,
        userId,
        clientId: dto.localId,
        type: dto.type,
        quantity: dto.quantity,
        pricePerUnit: dto.pricePerUnit,
        totalAmount: totalAmount + (dto.type === 'buy' ? fee : -fee),
        fee,
        date: new Date(dto.date),
        notes: dto.notes,
      },
    });

    // Recalculate holding aggregates
    await this.recalculateHolding(dto.holdingId);

    return transaction;
  }

  async updateTransaction(
    accountId: string,
    txId: string,
    dto: UpdateInvestmentTransactionDto,
  ) {
    const tx = await this.prisma.investmentTransaction.findFirst({
      where: { id: txId, accountId, isDeleted: false },
    });

    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }

    const quantity = dto.quantity ?? Number(tx.quantity);
    const pricePerUnit = dto.pricePerUnit ?? Number(tx.pricePerUnit);
    const fee = dto.fee ?? Number(tx.fee);
    const totalAmount = quantity * pricePerUnit + (tx.type === 'buy' ? fee : -fee);

    const updated = await this.prisma.investmentTransaction.update({
      where: { id: txId },
      data: {
        quantity: dto.quantity,
        pricePerUnit: dto.pricePerUnit,
        totalAmount,
        fee: dto.fee,
        date: dto.date ? new Date(dto.date) : undefined,
        notes: dto.notes,
        syncVersion: { increment: 1 },
      },
    });

    await this.recalculateHolding(tx.holdingId);

    return updated;
  }

  async removeTransaction(accountId: string, txId: string) {
    const tx = await this.prisma.investmentTransaction.findFirst({
      where: { id: txId, accountId, isDeleted: false },
    });

    if (!tx) {
      throw new NotFoundException('Transaction not found');
    }

    await this.prisma.investmentTransaction.update({
      where: { id: txId },
      data: { isDeleted: true, syncVersion: { increment: 1 } },
    });

    await this.recalculateHolding(tx.holdingId);

    return { success: true };
  }

  // ---- Portfolio Summary ----

  async getPortfolioSummary(accountId: string) {
    const holdings = await this.prisma.portfolioHolding.findMany({
      where: { accountId, isDeleted: false },
      include: { asset: true },
    });

    if (holdings.length === 0) {
      return {
        summary: {
          totalValue: 0,
          totalInvested: 0,
          totalPnL: 0,
          totalPnLPercent: 0,
          dayChange: 0,
          dayChangePercent: 0,
          holdings: [],
        },
        lastPriceUpdate: new Date().toISOString(),
      };
    }

    // Batch fetch current prices
    const symbols = holdings.map((h: typeof holdings[number]) =>
      h.asset.exchange ? `${h.asset.symbol}:${h.asset.exchange}` : h.asset.symbol,
    );
    const prices = await this.twelveData.getBatchPrices(symbols);

    // Update asset prices in DB
    for (const holding of holdings) {
      const symbolKey = holding.asset.exchange
        ? `${holding.asset.symbol}:${holding.asset.exchange}`
        : holding.asset.symbol;
      const price = prices.get(symbolKey);
      if (price !== undefined) {
        await this.prisma.asset.update({
          where: { id: holding.asset.id },
          data: { currentPrice: price, lastPriceUpdate: new Date() },
        });
      }
    }

    let totalValue = 0;
    let totalInvested = 0;

    const holdingSummaries = holdings.map((h: typeof holdings[number]) => {
      const symbolKey = h.asset.exchange
        ? `${h.asset.symbol}:${h.asset.exchange}`
        : h.asset.symbol;
      const currentPrice = prices.get(symbolKey) ?? Number(h.asset.currentPrice ?? 0);
      const qty = Number(h.quantity);
      const avgCost = Number(h.averageCostBasis);
      const invested = Number(h.totalInvested);
      const marketValue = qty * currentPrice;
      const pnl = marketValue - invested;
      const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

      totalValue += marketValue;
      totalInvested += invested;

      return {
        holdingId: h.id,
        assetId: h.asset.id,
        symbol: h.asset.symbol,
        name: h.asset.name,
        assetType: h.asset.type as 'stock' | 'crypto' | 'etf' | 'bond' | 'commodity',
        quantity: qty,
        averageCostBasis: avgCost,
        currentPrice,
        marketValue,
        totalInvested: invested,
        pnl,
        pnlPercent,
        dayChange: 0, // Would need previous close to calculate
        dayChangePercent: 0,
        allocationPercent: 0, // Calculated below
      };
    });

    // Calculate allocation percentages
    for (const hs of holdingSummaries) {
      hs.allocationPercent = totalValue > 0 ? (hs.marketValue / totalValue) * 100 : 0;
    }

    const totalPnL = totalValue - totalInvested;
    const totalPnLPercent = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    return {
      summary: {
        totalValue,
        totalInvested,
        totalPnL,
        totalPnLPercent,
        dayChange: 0,
        dayChangePercent: 0,
        holdings: holdingSummaries,
      },
      lastPriceUpdate: new Date().toISOString(),
    };
  }

  // ---- Portfolio Analytics ----

  async getPortfolioAnalytics(accountId: string, dto: PortfolioAnalyticsRequestDto) {
    const holdings = await this.prisma.portfolioHolding.findMany({
      where: { accountId, isDeleted: false },
      include: { asset: true },
    });

    // Determine date range
    let days: number;
    switch (dto.period) {
      case 'week': days = 7; break;
      case 'month': days = 30; break;
      case 'quarter': days = 90; break;
      case 'year': days = 365; break;
      case 'all': days = 1825; break; // ~5 years
      default: days = 30;
    }

    // Fetch historical prices for each asset
    const performanceDates: string[] = [];
    const performanceValues: number[] = [];
    const investedValues: number[] = [];

    if (holdings.length > 0) {
      const priceMap = new Map<string, Map<string, number>>();

      // Fetch time series for each holding from Twelve Data (with DB fallback)
      for (const h of holdings) {
        const symbol = h.asset.exchange
          ? `${h.asset.symbol}:${h.asset.exchange}`
          : h.asset.symbol;

        let seriesData = await this.twelveData.getTimeSeries(symbol, days);

        // Store in DB for future use
        for (const point of seriesData) {
          try {
            await this.prisma.assetPriceHistory.upsert({
              where: {
                assetId_date: {
                  assetId: h.asset.id,
                  date: new Date(point.date),
                },
              },
              update: {
                closePrice: point.close,
                openPrice: point.open,
                highPrice: point.high,
                lowPrice: point.low,
                volume: point.volume || null,
              },
              create: {
                assetId: h.asset.id,
                date: new Date(point.date),
                closePrice: point.close,
                openPrice: point.open,
                highPrice: point.high,
                lowPrice: point.low,
                volume: point.volume || null,
              },
            });
          } catch {
            // Ignore upsert errors
          }
        }

        // Fallback to cached DB price history if API returned nothing
        if (seriesData.length === 0) {
          this.logger.warn(`No time series from API for ${symbol}, falling back to DB cache`);
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - days);
          const cachedPrices = await this.prisma.assetPriceHistory.findMany({
            where: {
              assetId: h.asset.id,
              date: { gte: startDate },
            },
            orderBy: { date: 'desc' },
          });

          if (cachedPrices.length > 0) {
            seriesData = cachedPrices.map((p: typeof cachedPrices[number]) => ({
              date: p.date.toISOString().split('T')[0],
              open: Number(p.openPrice),
              high: Number(p.highPrice),
              low: Number(p.lowPrice),
              close: Number(p.closePrice),
              volume: Number(p.volume) || 0,
            }));
          }
        }

        priceMap.set(h.asset.symbol, new Map(
          seriesData.map((p) => [p.date, p.close]),
        ));
      }

      // Collect all unique dates from all holdings, sorted chronologically
      const allDates = new Set<string>();
      for (const symbolPrices of priceMap.values()) {
        for (const date of symbolPrices.keys()) {
          allDates.add(date);
        }
      }
      const dates = Array.from(allDates).sort();

      // Track last known price for each holding to fill gaps
      const lastKnownPrice = new Map<string, number>();

      // Initialize with current prices as fallback
      for (const h of holdings) {
        if (h.asset.currentPrice) {
          lastKnownPrice.set(h.asset.symbol, Number(h.asset.currentPrice));
        }
      }

      // Compute portfolio value for each date
      for (const date of dates) {
        let dailyValue = 0;
        let dailyInvested = 0;
        let hasAllPrices = true;

        for (const h of holdings) {
          const symbolPrices = priceMap.get(h.asset.symbol);
          const price = symbolPrices?.get(date);

          if (price) {
            lastKnownPrice.set(h.asset.symbol, price);
            dailyValue += Number(h.quantity) * price;
          } else {
            // Use last known price if available
            const fallbackPrice = lastKnownPrice.get(h.asset.symbol);
            if (fallbackPrice) {
              dailyValue += Number(h.quantity) * fallbackPrice;
            } else {
              hasAllPrices = false;
            }
          }
          dailyInvested += Number(h.totalInvested);
        }

        // Only include dates where we have prices for all holdings
        if (hasAllPrices) {
          performanceDates.push(date);
          performanceValues.push(Math.round(dailyValue * 100) / 100);
          investedValues.push(Math.round(dailyInvested * 100) / 100);
        }
      }

      // If still no data, generate minimal chart from current prices
      if (performanceDates.length === 0) {
        this.logger.warn('No historical data available, generating minimal chart from current prices');
        const today = new Date().toISOString().split('T')[0];
        let currentValue = 0;
        let currentInvested = 0;
        for (const h of holdings) {
          const price = Number(h.asset.currentPrice ?? 0);
          currentValue += Number(h.quantity) * price;
          currentInvested += Number(h.totalInvested);
        }
        if (currentValue > 0) {
          // Create a simple 2-point chart (invested → current)
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - Math.min(days, 30));
          performanceDates.push(startDate.toISOString().split('T')[0], today);
          performanceValues.push(
            Math.round(currentInvested * 100) / 100,
            Math.round(currentValue * 100) / 100,
          );
          investedValues.push(
            Math.round(currentInvested * 100) / 100,
            Math.round(currentInvested * 100) / 100,
          );
        }
      }
    }

    // Benchmark data
    let benchmarkValues: number[] | undefined;
    let benchmarkName: string | undefined;
    if (dto.benchmark) {
      const benchSeries = await this.twelveData.getTimeSeries(dto.benchmark, days);
      if (benchSeries.length > 0) {
        benchmarkName = dto.benchmark;
        const basePrice = benchSeries[benchSeries.length - 1].close;
        benchmarkValues = benchSeries
          .reverse()
          .map((p) => Math.round(((p.close / basePrice) * 100 - 100) * 100) / 100);
      }
    }

    // Allocation by asset type
    const typeMap = new Map<string, number>();
    let totalValue = 0;
    for (const h of holdings) {
      const value = Number(h.quantity) * Number(h.asset.currentPrice ?? 0);
      totalValue += value;
      typeMap.set(h.asset.type, (typeMap.get(h.asset.type) || 0) + value);
    }

    const allocation = Array.from(typeMap.entries()).map(([assetType, value]) => ({
      assetType: assetType as 'stock' | 'crypto' | 'etf' | 'bond' | 'commodity',
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }));

    // Top gainers/losers
    const holdingPnl = holdings.map((h: typeof holdings[number]) => {
      const currentPrice = Number(h.asset.currentPrice ?? 0);
      const avgCost = Number(h.averageCostBasis);
      const pnlPercent = avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;
      return { symbol: h.asset.symbol, pnlPercent };
    });

    type HoldingPnlItem = { symbol: string; pnlPercent: number };
    holdingPnl.sort((a: HoldingPnlItem, b: HoldingPnlItem) => b.pnlPercent - a.pnlPercent);

    return {
      performance: {
        dates: performanceDates,
        values: performanceValues,
        investedValues,
        benchmarkValues,
        benchmarkName,
      },
      allocation,
      topGainers: holdingPnl.filter((h: HoldingPnlItem) => h.pnlPercent > 0).slice(0, 5),
      topLosers: holdingPnl.filter((h: HoldingPnlItem) => h.pnlPercent < 0).slice(-5).reverse(),
    };
  }

  // ---- Price Refresh ----

  async refreshPrices(accountId: string) {
    const holdings = await this.prisma.portfolioHolding.findMany({
      where: { accountId, isDeleted: false },
      include: { asset: true },
    });

    if (holdings.length === 0) return { success: true };

    // Fix priceCurrency for assets that may have been created with default USD
    const usExchanges = new Set(['NYSE', 'NASDAQ', 'AMEX', 'OTC']);
    for (const holding of holdings) {
      if (
        holding.asset.priceCurrency === 'USD' &&
        holding.asset.exchange &&
        !usExchanges.has(holding.asset.exchange)
      ) {
        try {
          const results = await this.twelveData.searchAssets(holding.asset.symbol);
          const match = results.find(
            (r) => r.symbol === holding.asset.symbol && r.exchange === holding.asset.exchange,
          );
          if (match && match.currency !== 'USD') {
            await this.prisma.asset.update({
              where: { id: holding.asset.id },
              data: { priceCurrency: match.currency },
            });
            holding.asset.priceCurrency = match.currency;
          }
        } catch {
          // Non-critical, continue
        }
      }
    }

    const symbols = holdings.map((h: typeof holdings[number]) =>
      h.asset.exchange ? `${h.asset.symbol}:${h.asset.exchange}` : h.asset.symbol,
    );

    const prices = await this.twelveData.getBatchPrices(symbols);

    for (const holding of holdings) {
      const symbolKey = holding.asset.exchange
        ? `${holding.asset.symbol}:${holding.asset.exchange}`
        : holding.asset.symbol;
      const price = prices.get(symbolKey);
      if (price !== undefined) {
        await this.prisma.asset.update({
          where: { id: holding.asset.id },
          data: { currentPrice: price, lastPriceUpdate: new Date() },
        });
      }
    }

    return { success: true };
  }

  // ---- Asset Price History ----

  async getAssetPriceHistory(accountId: string, holdingId: string, days: number = 30) {
    const holding = await this.prisma.portfolioHolding.findFirst({
      where: { id: holdingId, accountId, isDeleted: false },
      include: { asset: true },
    });

    if (!holding) {
      throw new NotFoundException('Holding not found');
    }

    const symbol = holding.asset.exchange
      ? `${holding.asset.symbol}:${holding.asset.exchange}`
      : holding.asset.symbol;

    // Try Twelve Data first
    const seriesData = await this.twelveData.getTimeSeries(symbol, days);

    // Store in DB for future use
    for (const point of seriesData) {
      try {
        await this.prisma.assetPriceHistory.upsert({
          where: {
            assetId_date: {
              assetId: holding.asset.id,
              date: new Date(point.date),
            },
          },
          update: { closePrice: point.close },
          create: {
            assetId: holding.asset.id,
            date: new Date(point.date),
            closePrice: point.close,
            openPrice: point.open,
            highPrice: point.high,
            lowPrice: point.low,
            volume: point.volume || null,
          },
        });
      } catch {
        // Ignore upsert errors
      }
    }

    // Fallback to DB cache
    if (seriesData.length === 0) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const cached = await this.prisma.assetPriceHistory.findMany({
        where: {
          assetId: holding.asset.id,
          date: { gte: startDate },
        },
        orderBy: { date: 'asc' },
      });

      return {
        dates: cached.map((p: typeof cached[number]) => p.date.toISOString().split('T')[0]),
        prices: cached.map((p: typeof cached[number]) => Number(p.closePrice)),
      };
    }

    // Sort chronologically (API returns desc)
    const sorted = [...seriesData].sort((a, b) => a.date.localeCompare(b.date));

    return {
      dates: sorted.map((p) => p.date),
      prices: sorted.map((p) => p.close),
    };
  }

  // ---- Helpers ----

  private async findOrCreateAsset(
    symbol: string,
    name: string,
    type: string,
    exchange?: string,
    currency?: string,
  ) {
    const existing = await this.prisma.asset.findFirst({
      where: { symbol, exchange: exchange || null },
    });

    if (existing) {
      // Update priceCurrency if it was defaulted to USD but we now know the real currency
      if (currency && existing.priceCurrency === 'USD' && currency !== 'USD') {
        await this.prisma.asset.update({
          where: { id: existing.id },
          data: { priceCurrency: currency },
        });
        return { ...existing, priceCurrency: currency };
      }
      return existing;
    }

    // Try to get current price
    const price = await this.twelveData.getCurrentPrice(symbol, exchange);

    return this.prisma.asset.create({
      data: {
        symbol,
        name,
        type,
        exchange: exchange || null,
        priceCurrency: currency || 'USD',
        currentPrice: price,
        lastPriceUpdate: price ? new Date() : null,
      },
    });
  }

  private async recalculateHolding(holdingId: string) {
    const transactions = await this.prisma.investmentTransaction.findMany({
      where: { holdingId, isDeleted: false },
      orderBy: { date: 'asc' },
    });

    let quantity = 0;
    let totalInvested = 0;

    for (const tx of transactions) {
      const qty = Number(tx.quantity);
      const price = Number(tx.pricePerUnit);
      const fee = Number(tx.fee);

      if (tx.type === 'buy') {
        totalInvested += qty * price + fee;
        quantity += qty;
      } else {
        // Sell: reduce quantity and proportionally reduce totalInvested
        const avgCost = quantity > 0 ? totalInvested / quantity : 0;
        totalInvested -= qty * avgCost;
        quantity -= qty;
      }
    }

    const averageCostBasis = quantity > 0 ? totalInvested / quantity : 0;

    await this.prisma.portfolioHolding.update({
      where: { id: holdingId },
      data: {
        quantity: Math.max(0, quantity),
        averageCostBasis: Math.max(0, averageCostBasis),
        totalInvested: Math.max(0, totalInvested),
        syncVersion: { increment: 1 },
      },
    });
  }
}

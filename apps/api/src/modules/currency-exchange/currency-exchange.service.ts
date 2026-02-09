import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CurrencyExchangeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, userId: string, dto: any) {
    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('Source and target currencies must be different');
    }

    return this.prisma.currencyExchange.create({
      data: {
        accountId,
        userId,
        clientId: dto.localId,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        fromAmount: dto.fromAmount,
        toAmount: dto.toAmount,
        exchangeRate: dto.exchangeRate,
        date: new Date(dto.date),
        notes: dto.notes,
      },
    });
  }

  async findAll(accountId: string, filters: any = {}) {
    const where: any = { accountId, isDeleted: false };

    if (filters.startDate) {
      where.date = { ...where.date, gte: new Date(filters.startDate) };
    }
    if (filters.endDate) {
      where.date = { ...where.date, lte: new Date(filters.endDate) };
    }
    if (filters.currency) {
      where.OR = [
        { fromCurrency: filters.currency },
        { toCurrency: filters.currency },
      ];
    }

    return this.prisma.currencyExchange.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async findOne(accountId: string, id: string) {
    const exchange = await this.prisma.currencyExchange.findFirst({
      where: { id, accountId, isDeleted: false },
    });

    if (!exchange) {
      throw new NotFoundException('Currency exchange not found');
    }

    return exchange;
  }

  async remove(accountId: string, id: string) {
    const exchange = await this.findOne(accountId, id);

    await this.prisma.currencyExchange.update({
      where: { id: exchange.id },
      data: {
        isDeleted: true,
        syncVersion: { increment: 1 },
      },
    });

    return { success: true };
  }
}

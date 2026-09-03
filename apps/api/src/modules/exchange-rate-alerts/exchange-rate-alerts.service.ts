import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateExchangeRateWatchDto } from './dto';

// Prisma Decimal serializes to a string via its own toJSON(), not the `number` the
// shared-types response declares — same boundary every money-bearing service in this
// codebase converts explicitly (e.g. expenses.service.ts's toExpenseResponse).
function toWatchResponse<T extends { targetRate: unknown; triggeredRate: unknown }>(watch: T) {
  return {
    ...watch,
    targetRate: Number(watch.targetRate),
    triggeredRate: watch.triggeredRate != null ? Number(watch.triggeredRate) : null,
  };
}

// Mirrors ExchangeRateService's own local list (that service filters the live provider
// response down to exactly these). Kept in sync by hand — this module has no runtime
// dependency on @budget/shared-types (type-only for the API, see CLAUDE.md).
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'PLN', 'GBP', 'UAH', 'RUB', 'BYN'];

// Cheap abuse guard — no product reason for a user to ever need more than a handful.
export const MAX_ACTIVE_WATCHES = 20;

@Injectable()
export class ExchangeRateAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateExchangeRateWatchDto) {
    if (!SUPPORTED_CURRENCIES.includes(dto.fromCurrency) || !SUPPORTED_CURRENCIES.includes(dto.toCurrency)) {
      throw new BadRequestException('Unsupported currency');
    }
    if (dto.fromCurrency === dto.toCurrency) {
      throw new BadRequestException('fromCurrency and toCurrency must differ');
    }

    // count-then-create is not atomic — two concurrent creates could both pass this
    // check and land the user slightly over MAX_ACTIVE_WATCHES. Harmless (it's only
    // an abuse guard, not a hard invariant), so not worth a transaction.
    const activeCount = await this.prisma.exchangeRateWatch.count({
      where: { userId, isActive: true },
    });
    if (activeCount >= MAX_ACTIVE_WATCHES) {
      throw new BadRequestException(`Maximum of ${MAX_ACTIVE_WATCHES} active rate alerts reached`);
    }

    const watch = await this.prisma.exchangeRateWatch.create({
      data: {
        userId,
        fromCurrency: dto.fromCurrency,
        toCurrency: dto.toCurrency,
        targetRate: dto.targetRate,
        direction: dto.direction,
      },
    });
    return toWatchResponse(watch);
  }

  async findAllForUser(userId: string) {
    const watches = await this.prisma.exchangeRateWatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return watches.map(toWatchResponse);
  }

  async remove(userId: string, id: string): Promise<void> {
    // Scoped delete: deleteMany rather than delete-by-id-then-check, so a mismatched
    // userId 404s instead of leaking whether another user's row exists.
    const result = await this.prisma.exchangeRateWatch.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Rate alert not found');
    }
  }
}

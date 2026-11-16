import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateVehicleDto, MoveVehicleDto, UpdateVehicleDto, UpsertFuelLogDto } from './dto';
import { computeFuelStats, VehicleStats } from './fuel-stats.util';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';

/** What the app shows for a fill-up: the log plus the expense it hangs on. */
const FUEL_LOG_EXPENSE_SELECT = {
  id: true,
  clientId: true,
  amount: true,
  currencyCode: true,
  date: true,
  merchant: true,
  description: true,
} as const;

@Injectable()
export class VehiclesService {
  constructor(
    private prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  findAll(accountId: string) {
    return this.prisma.vehicle.findMany({
      where: { accountId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(accountId: string, userId: string, dto: CreateVehicleDto) {
    return this.prisma.vehicle.create({
      data: { accountId, userId, name: dto.name.trim(), fuelType: dto.fuelType ?? 'petrol' },
    });
  }

  async update(accountId: string, id: string, dto: UpdateVehicleDto) {
    await this.findOne(accountId, id);
    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.fuelType !== undefined && { fuelType: dto.fuelType }),
      },
    });
  }

  /**
   * Moves a vehicle created in the wrong account to another one the caller can
   * edit (ABA-801). Only a vehicle with no fill-ups: each fill-up hangs on an
   * expense that stays in the source account, and stats read fill-ups through
   * the expense's account. Vehicles hold no encrypted fields.
   */
  async move(accountId: string, userId: string, id: string, dto: MoveVehicleDto) {
    if (dto.targetAccountId === accountId) throw new BadRequestException('Already in this account');
    await this.findOne(accountId, id);
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId: dto.targetAccountId, userId } },
      select: { role: true },
    });
    if (!membership || membership.role === 'viewer') throw new ForbiddenException('You cannot edit the target account');
    const fillUps = await this.prisma.fuelLog.count({ where: { vehicleId: id, expense: { isDeleted: false } } });
    if (fillUps > 0) {
      throw new ConflictException({ code: 'VEHICLE_IN_USE', message: 'This vehicle has fill-ups; it cannot move' });
    }
    return this.prisma.$transaction(async (tx) => {
      // Logs on deleted expenses would point across accounts after the move.
      await tx.fuelLog.deleteMany({ where: { vehicleId: id } });
      return tx.vehicle.update({ where: { id }, data: { accountId: dto.targetAccountId } });
    });
  }

  async remove(accountId: string, id: string) {
    await this.findOne(accountId, id);
    await this.prisma.vehicle.update({ where: { id }, data: { isDeleted: true } });
    return { success: true };
  }

  async findOne(accountId: string, id: string) {
    const v = await this.prisma.vehicle.findFirst({ where: { id, accountId, isDeleted: false } });
    if (!v) throw new NotFoundException('Vehicle not found');
    return v;
  }

  async listFuelLogs(accountId: string, vehicleId: string) {
    await this.findOne(accountId, vehicleId);
    return this.prisma.fuelLog.findMany({
      where: { accountId, vehicleId, expense: { accountId, isDeleted: false } },
      include: { expense: { select: FUEL_LOG_EXPENSE_SELECT } },
      orderBy: { odometerKm: 'desc' },
    });
  }

  /**
   * The fill-up recorded on one expense (PK or clientId), or null — the
   * expense screen asks this for every expense, so "none" is an answer, not a 404.
   */
  async findFuelLogForExpense(accountId: string, expenseIdOrClientId: string) {
    const fuelLog = await this.prisma.fuelLog.findFirst({
      where: {
        accountId,
        expense: { accountId, isDeleted: false, OR: [{ id: expenseIdOrClientId }, { clientId: expenseIdOrClientId }] },
        vehicle: { isDeleted: false },
      },
    });
    return { fuelLog };
  }

  async upsertFuelLog(
    accountId: string,
    vehicleId: string,
    expenseIdOrClientId: string,
    dto: UpsertFuelLogDto,
  ) {
    await this.findOne(accountId, vehicleId);
    const expense = await this.prisma.expense.findFirst({
      where: {
        accountId,
        isDeleted: false,
        OR: [{ id: expenseIdOrClientId }, { clientId: expenseIdOrClientId }],
      },
      select: { id: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    const data = {
      vehicleId,
      liters: dto.liters,
      odometerKm: dto.odometerKm,
      isFullTank: dto.isFullTank ?? true,
    };
    return this.prisma.fuelLog.upsert({
      where: { expenseId: expense.id },
      create: { accountId, expenseId: expense.id, ...data },
      update: data,
    });
  }

  async removeFuelLog(accountId: string, expenseIdOrClientId: string) {
    const log = await this.prisma.fuelLog.findFirst({
      where: {
        accountId,
        expense: { OR: [{ id: expenseIdOrClientId }, { clientId: expenseIdOrClientId }] },
      },
      select: { id: true },
    });
    if (!log) throw new NotFoundException('Fuel log not found');
    await this.prisma.fuelLog.delete({ where: { id: log.id } });
    return { success: true };
  }

  /**
   * Fuel stats in the caller's display currency (ABA-796). A fill-up with no
   * known rate keeps its litres and distance but contributes no cost, and the
   * result says `fxApproximate` — never summed unconverted.
   */
  async getStats(
    accountId: string,
    vehicleId: string,
    baseCurrency = 'USD',
  ): Promise<VehicleStats & { currencyCode: string; fxApproximate: boolean }> {
    await this.findOne(accountId, vehicleId);
    const logs = await this.prisma.fuelLog.findMany({
      where: { accountId, vehicleId, expense: { accountId, isDeleted: false } },
      include: { expense: { select: { amount: true, currencyCode: true, date: true } } },
    });
    const needsFx = logs.some((l) => l.expense.currencyCode !== baseCurrency);
    const rates = needsFx ? await getRatesSafe(this.exchangeRateService, baseCurrency) : null;
    let fxApproximate = false;
    const stats = computeFuelStats(
      logs.map((l) => {
        const converted = convertAmount(Number(l.expense.amount), l.expense.currencyCode, baseCurrency, rates);
        if (converted === null) fxApproximate = true;
        return {
          date: l.expense.date,
          odometerKm: l.odometerKm,
          liters: Number(l.liters),
          amount: converted ?? 0,
          isFullTank: l.isFullTank,
        };
      }),
    );
    return { ...stats, currencyCode: baseCurrency, fxApproximate };
  }
}

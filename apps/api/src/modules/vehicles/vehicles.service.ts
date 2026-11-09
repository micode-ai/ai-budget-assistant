import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateVehicleDto, UpdateVehicleDto, UpsertFuelLogDto } from './dto';
import { computeFuelStats, VehicleStats } from './fuel-stats.util';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

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
      orderBy: { odometerKm: 'desc' },
    });
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

  async getStats(accountId: string, vehicleId: string): Promise<VehicleStats> {
    await this.findOne(accountId, vehicleId);
    const logs = await this.prisma.fuelLog.findMany({
      where: { accountId, vehicleId, expense: { accountId, isDeleted: false } },
      include: { expense: { select: { amount: true, date: true } } },
    });
    return computeFuelStats(
      logs.map((l) => ({
        date: l.expense.date,
        odometerKm: l.odometerKm,
        liters: Number(l.liters),
        amount: Number(l.expense.amount),
        isFullTank: l.isFullTank,
      })),
    );
  }
}

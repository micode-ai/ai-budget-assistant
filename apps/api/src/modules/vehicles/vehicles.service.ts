import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  BulkVehicleCostDto,
  CreateVehicleDto,
  MoveVehicleDto,
  SetVehicleCategoryRulesDto,
  SetVehicleCostDto,
  UpdateVehicleDto,
  UpsertFuelLogDto,
} from './dto';
import { applyVehicleCategoryRules, parseCategoryRules, type VehicleCostKind } from './vehicle-cost-rules.util';
import { computeFuelStats, VehicleStats } from './fuel-stats.util';
import { computeVehicleHistory, VehicleHistory, windowStart } from './vehicle-history.util';
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

/** Last 12 months of a vehicle's costs, fuel included (ABA-803). */
export interface Ownership {
  months: number;
  total: number;
  perMonth: number;
  byKind: Record<string, number>;
  /** Distance between the lowest and highest odometer reading in the window; 0 under two fill-ups. */
  kmLast12Months: number;
  /** Every cost per km over the window; null without a distance. */
  costPerKm: number | null;
}

/** `YYYY-MM-DD` (or a full ISO string) to a UTC calendar day; null clears. */
function toDateOnly(v: string | null): Date | null {
  return v === null ? null : new Date(`${v.slice(0, 10)}T00:00:00Z`);
}

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
        ...(dto.nextInsuranceDate !== undefined && { nextInsuranceDate: toDateOnly(dto.nextInsuranceDate) }),
        ...(dto.nextInspectionDate !== undefined && { nextInspectionDate: toDateOnly(dto.nextInspectionDate) }),
        ...(dto.nextServiceDate !== undefined && { nextServiceDate: toDateOnly(dto.nextServiceDate) }),
        ...(dto.nextServiceOdometer !== undefined && {
          nextServiceOdometer: dto.nextServiceOdometer,
          // A new target re-arms the odometer nudge.
          serviceOdometerNudgedFor: null,
        }),
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
    const [fillUps, costs] = await Promise.all([
      this.prisma.fuelLog.count({ where: { vehicleId: id, expense: { isDeleted: false } } }),
      this.prisma.vehicleCost.count({ where: { vehicleId: id, kind: { not: 'none' }, expense: { isDeleted: false } } }),
    ]);
    if (fillUps + costs > 0) {
      throw new ConflictException({ code: 'VEHICLE_IN_USE', message: 'This vehicle has fill-ups; it cannot move' });
    }
    return this.prisma.$transaction(async (tx) => {
      // Logs on deleted expenses would point across accounts after the move.
      await tx.fuelLog.deleteMany({ where: { vehicleId: id } });
      await tx.vehicleCost.deleteMany({ where: { vehicleId: id } });
      // Category ids are per account; the rules do not travel.
      return tx.vehicle.update({ where: { id }, data: { accountId: dto.targetAccountId, categoryRules: [] } });
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
    const costRow = await this.prisma.vehicleCost.findFirst({
      where: {
        accountId,
        kind: { not: 'none' },
        expense: { accountId, isDeleted: false, OR: [{ id: expenseIdOrClientId }, { clientId: expenseIdOrClientId }] },
        vehicle: { isDeleted: false },
      },
      select: { vehicleId: true, kind: true, source: true },
    });
    return { fuelLog, cost: costRow };
  }

  /**
   * The vehicle of the account's most recent fill-up (on a live expense), or
   * null — the bots' "last used" when a scanned fuel receipt picks a vehicle
   * (ABA-830), the server-side counterpart of the app's session memory.
   */
  async lastFuelVehicleId(accountId: string): Promise<string | null> {
    const last = await this.prisma.fuelLog.findFirst({
      where: { accountId, vehicle: { isDeleted: false }, expense: { accountId, isDeleted: false } },
      orderBy: { createdAt: 'desc' },
      select: { vehicleId: true },
    });
    return last?.vehicleId ?? null;
  }

  private async resolveExpense(accountId: string, expenseIdOrClientId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: expenseIdOrClientId }, { clientId: expenseIdOrClientId }] },
      select: { id: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  /** Marks an expense as a non-fuel cost of this vehicle, by a person (ABA-803). Replaces a fill-up. */
  async setCost(accountId: string, vehicleId: string, expenseIdOrClientId: string, dto: SetVehicleCostDto) {
    await this.findOne(accountId, vehicleId);
    const expense = await this.resolveExpense(accountId, expenseIdOrClientId);
    await this.prisma.fuelLog.deleteMany({ where: { expenseId: expense.id } });
    return this.prisma.vehicleCost.upsert({
      where: { expenseId: expense.id },
      create: { accountId, vehicleId, expenseId: expense.id, kind: dto.kind, source: null },
      update: { vehicleId, kind: dto.kind, source: null },
    });
  }

  /**
   * Marks many expenses as one kind of cost of this vehicle in one request
   * (ABA-805) — the transactions list's bulk action; one request instead of
   * one per row keeps a large selection under the proxy's rate limit. Like
   * `setCost` it is a person's decision (`source: null`), but a fill-up (with
   * litres and odometer) is never overwritten by a bulk action: it is skipped
   * and counted. Ids may be PKs or clientIds; unknown ones are counted too.
   */
  async setCostsBulk(accountId: string, vehicleId: string, dto: BulkVehicleCostDto) {
    await this.findOne(accountId, vehicleId);
    const ids = [...new Set(dto.expenseIds)];
    const expenses = await this.prisma.expense.findMany({
      where: { accountId, isDeleted: false, OR: [{ id: { in: ids } }, { clientId: { in: ids } }] },
      select: { id: true, fuelLog: { select: { id: true } } },
    });
    let assigned = 0;
    let skipped = 0;
    for (const e of expenses) {
      if (e.fuelLog) {
        skipped++;
        continue;
      }
      await this.prisma.vehicleCost.upsert({
        where: { expenseId: e.id },
        create: { accountId, vehicleId, expenseId: e.id, kind: dto.kind, source: null },
        update: { vehicleId, kind: dto.kind, source: null },
      });
      assigned++;
    }
    return { assigned, skipped, notFound: Math.max(0, ids.length - expenses.length) };
  }

  /**
   * Removes the car cost from an expense. Kept as a `none` row by a person, so
   * a category rule does not put it back (ABA-803).
   */
  async removeCost(accountId: string, expenseIdOrClientId: string) {
    const expense = await this.resolveExpense(accountId, expenseIdOrClientId);
    const existing = await this.prisma.vehicleCost.findUnique({ where: { expenseId: expense.id } });
    if (!existing) throw new NotFoundException('Vehicle cost not found');
    await this.prisma.vehicleCost.update({ where: { id: existing.id }, data: { kind: 'none', source: null } });
    return { success: true };
  }

  /** The vehicle's non-fuel costs with their expenses, newest first. */
  async listCosts(accountId: string, vehicleId: string) {
    await this.findOne(accountId, vehicleId);
    return this.prisma.vehicleCost.findMany({
      where: { accountId, vehicleId, kind: { not: 'none' }, expense: { accountId, isDeleted: false } },
      include: { expense: { select: FUEL_LOG_EXPENSE_SELECT } },
      orderBy: { expense: { date: 'desc' } },
    });
  }

  async getCategoryRules(accountId: string, vehicleId: string) {
    const v = await this.findOne(accountId, vehicleId);
    return { rules: await this.withIds(parseCategoryRules(v.categoryRules)) };
  }

  /**
   * Replaces the vehicle's category rules and applies them at once (ABA-803).
   * Category ids may be PKs or a device's clientId; only live expense
   * categories the account can see are accepted.
   */
  async setCategoryRules(accountId: string, vehicleId: string, dto: SetVehicleCategoryRulesDto) {
    await this.findOne(accountId, vehicleId);
    const rules: { categoryId: string; kind: VehicleCostKind }[] = [];
    for (const r of dto.rules) {
      const cat = await this.prisma.category.findFirst({
        where: {
          OR: [{ id: r.categoryId }, { clientId: r.categoryId }],
          AND: [{ OR: [{ accountId }, { accountId: null }] }],
          isDeleted: false,
          type: 'expense',
        },
        select: { id: true },
      });
      if (!cat) throw new BadRequestException('Unknown expense category');
      if (!rules.some((x) => x.categoryId === cat.id)) rules.push({ categoryId: cat.id, kind: r.kind as VehicleCostKind });
    }
    await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { categoryRules: rules } });
    const result = await applyVehicleCategoryRules(this.prisma, accountId);
    return { rules: await this.withIds(rules), ...result };
  }

  /**
   * Each rule with every spelling of its category — PK and the device's
   * clientId — so a phone that knows a category by its local id matches it
   * (category-id-resolution).
   */
  private async withIds(rules: { categoryId: string; kind: VehicleCostKind }[]) {
    if (rules.length === 0) return [];
    const rows = await this.prisma.category.findMany({
      where: { id: { in: rules.map((r) => r.categoryId) } },
      select: { id: true, clientId: true },
    });
    const clientOf = new Map(rows.map((r) => [r.id, r.clientId]));
    return rules.map((r) => {
      const clientId = clientOf.get(r.categoryId);
      return { ...r, ids: [r.categoryId, ...(clientId ? [clientId] : [])] };
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
    // One expense is either a fill-up or another car cost (ABA-803).
    await this.prisma.vehicleCost.deleteMany({ where: { expenseId: expense.id } });
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
  ): Promise<VehicleStats & { currencyCode: string; fxApproximate: boolean; ownership: Ownership; latestOdometerKm: number | null }> {
    await this.findOne(accountId, vehicleId);
    // The same 12 calendar months as the vehicle screen's default period (vehicle-history.util).
    const since = windowStart(new Date(), 12);
    const [logs, costs] = await Promise.all([
      this.prisma.fuelLog.findMany({
        where: { accountId, vehicleId, expense: { accountId, isDeleted: false } },
        include: { expense: { select: { amount: true, currencyCode: true, date: true } } },
      }),
      this.prisma.vehicleCost.findMany({
        where: { accountId, vehicleId, kind: { not: 'none' }, expense: { accountId, isDeleted: false, date: { gte: since } } },
        include: { expense: { select: { amount: true, currencyCode: true } } },
      }),
    ]);
    const needsFx =
      logs.some((l) => l.expense.currencyCode !== baseCurrency) || costs.some((c) => c.expense.currencyCode !== baseCurrency);
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

    // Cost of ownership over the last 12 months (ABA-803): fuel plus every other cost, by kind.
    const toBase = (amount: unknown, currency: string) => {
      const v = convertAmount(Number(amount), currency, baseCurrency, rates);
      if (v === null) fxApproximate = true;
      return v ?? 0;
    };
    const byKind: Record<string, number> = { fuel: 0, service: 0, insurance: 0, parking: 0, tax: 0, other: 0 };
    const recentLogs = logs.filter((l) => new Date(l.expense.date) >= since);
    for (const l of recentLogs) byKind.fuel += toBase(l.expense.amount, l.expense.currencyCode);
    for (const c of costs) byKind[c.kind] = (byKind[c.kind] ?? 0) + toBase(c.expense.amount, c.expense.currencyCode);
    const total = Object.values(byKind).reduce((a, b) => a + b, 0);
    const odo = recentLogs.map((l) => l.odometerKm);
    const km = odo.length >= 2 ? Math.max(...odo) - Math.min(...odo) : 0;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const ownership: Ownership = {
      months: 12,
      total: r2(total),
      perMonth: r2(total / 12),
      byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, r2(v)])),
      kmLast12Months: km,
      costPerKm: km > 0 ? Math.round((total / km) * 1000) / 1000 : null,
    };

    // The renewal chip's odometer (ABA-829): the same max reading the reminder cron reads.
    const latestOdometerKm = logs.length > 0 ? Math.max(...logs.map((l) => l.odometerKm)) : null;
    return { ...stats, currencyCode: baseCurrency, fxApproximate, ownership, latestOdometerKm };
  }

  /**
   * The vehicle screen (ABA-811): one period's costs by month and kind, the
   * consumption segments ending in it, and every fill-up and cost, in the
   * caller's display currency. `months` 0 = all time. An amount with no known
   * rate is listed but left out of every total, and `fxApproximate` says so.
   */
  async getHistory(
    accountId: string,
    vehicleId: string,
    months: number,
    baseCurrency = 'USD',
  ): Promise<VehicleHistory & { currencyCode: string; fxApproximate: boolean; latestOdometerKm: number | null }> {
    await this.findOne(accountId, vehicleId);
    const [logs, costs] = await Promise.all([
      this.prisma.fuelLog.findMany({
        where: { accountId, vehicleId, expense: { accountId, isDeleted: false } },
        include: { expense: { select: FUEL_LOG_EXPENSE_SELECT } },
      }),
      this.prisma.vehicleCost.findMany({
        where: { accountId, vehicleId, kind: { not: 'none' }, expense: { accountId, isDeleted: false } },
        include: { expense: { select: FUEL_LOG_EXPENSE_SELECT } },
      }),
    ]);
    const needsFx =
      logs.some((l) => l.expense.currencyCode !== baseCurrency) || costs.some((c) => c.expense.currencyCode !== baseCurrency);
    const rates = needsFx ? await getRatesSafe(this.exchangeRateService, baseCurrency) : null;
    let fxApproximate = false;
    const base = (amount: number, currency: string) => {
      const v = convertAmount(amount, currency, baseCurrency, rates);
      if (v === null) fxApproximate = true;
      return v;
    };
    const history = computeVehicleHistory(
      logs.map((l) => ({
        expenseId: l.expense.id,
        clientId: l.expense.clientId,
        date: new Date(l.expense.date),
        amount: Number(l.expense.amount),
        currencyCode: l.expense.currencyCode,
        amountBase: base(Number(l.expense.amount), l.expense.currencyCode),
        merchant: l.expense.merchant,
        description: l.expense.description,
        liters: Number(l.liters),
        odometerKm: l.odometerKm,
        isFullTank: l.isFullTank,
      })),
      costs.map((c) => ({
        expenseId: c.expense.id,
        clientId: c.expense.clientId,
        date: new Date(c.expense.date),
        amount: Number(c.expense.amount),
        currencyCode: c.expense.currencyCode,
        amountBase: base(Number(c.expense.amount), c.expense.currencyCode),
        merchant: c.expense.merchant,
        description: c.expense.description,
        kind: c.kind,
      })),
      months,
    );
    // Over every fill-up, not the period: the service-by-odometer chip (ABA-829).
    const latestOdometerKm = logs.length > 0 ? Math.max(...logs.map((l) => l.odometerKm)) : null;
    return { ...history, currencyCode: baseCurrency, fxApproximate, latestOdometerKm };
  }
}

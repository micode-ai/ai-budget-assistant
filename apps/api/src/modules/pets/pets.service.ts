import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import { BulkPetCostDto, CreatePetDto, SetPetCostDto, UpdatePetDto } from './dto';
import { computePetHistory, PetHistory } from './pet-history.util';

const EXPENSE_SELECT = {
  id: true,
  clientId: true,
  amount: true,
  currencyCode: true,
  date: true,
  merchant: true,
  description: true,
} as const;

/** `YYYY-MM-DD` (or a full ISO string) to a UTC calendar day; null clears. */
function toDateOnly(v: string | null): Date | null {
  return v === null ? null : new Date(`${v.slice(0, 10)}T00:00:00Z`);
}

@Injectable()
export class PetsService {
  constructor(
    private prisma: PrismaService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  findAll(accountId: string) {
    return this.prisma.pet.findMany({ where: { accountId, isDeleted: false }, orderBy: { createdAt: 'asc' } });
  }

  create(accountId: string, userId: string, dto: CreatePetDto) {
    return this.prisma.pet.create({
      data: {
        accountId,
        userId,
        name: dto.name.trim(),
        species: dto.species ?? 'dog',
        birthday: dto.birthday ? toDateOnly(dto.birthday) : null,
        nextVaccinationDate: dto.nextVaccinationDate ? toDateOnly(dto.nextVaccinationDate) : null,
        nextParasiteTreatmentDate: dto.nextParasiteTreatmentDate ? toDateOnly(dto.nextParasiteTreatmentDate) : null,
      },
    });
  }

  async findOne(accountId: string, id: string) {
    const p = await this.prisma.pet.findFirst({ where: { id, accountId, isDeleted: false } });
    if (!p) throw new NotFoundException('Pet not found');
    return p;
  }

  async update(accountId: string, id: string, dto: UpdatePetDto) {
    await this.findOne(accountId, id);
    return this.prisma.pet.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.species !== undefined && { species: dto.species }),
        ...(dto.birthday !== undefined && { birthday: toDateOnly(dto.birthday) }),
        ...(dto.nextVaccinationDate !== undefined && { nextVaccinationDate: toDateOnly(dto.nextVaccinationDate) }),
        ...(dto.nextParasiteTreatmentDate !== undefined && {
          nextParasiteTreatmentDate: toDateOnly(dto.nextParasiteTreatmentDate),
        }),
      },
    });
  }

  async remove(accountId: string, id: string) {
    await this.findOne(accountId, id);
    await this.prisma.pet.update({ where: { id }, data: { isDeleted: true } });
    return { success: true };
  }

  private async resolveExpense(accountId: string, expenseIdOrClientId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: expenseIdOrClientId }, { clientId: expenseIdOrClientId }] },
      select: { id: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async setCost(accountId: string, petId: string, expenseIdOrClientId: string, dto: SetPetCostDto) {
    await this.findOne(accountId, petId);
    const expense = await this.resolveExpense(accountId, expenseIdOrClientId);
    return this.prisma.petCost.upsert({
      where: { expenseId: expense.id },
      create: { accountId, petId, expenseId: expense.id, kind: dto.kind },
      update: { petId, kind: dto.kind },
    });
  }

  /** Many expenses at once, from the transactions list; one request keeps a big selection under the proxy rate limit. */
  async setCostsBulk(accountId: string, petId: string, dto: BulkPetCostDto) {
    await this.findOne(accountId, petId);
    const ids = [...new Set(dto.expenseIds)];
    const expenses = await this.prisma.expense.findMany({
      where: { accountId, isDeleted: false, OR: [{ id: { in: ids } }, { clientId: { in: ids } }] },
      select: { id: true },
    });
    for (const e of expenses) {
      await this.prisma.petCost.upsert({
        where: { expenseId: e.id },
        create: { accountId, petId, expenseId: e.id, kind: dto.kind },
        update: { petId, kind: dto.kind },
      });
    }
    return { assigned: expenses.length, notFound: Math.max(0, ids.length - expenses.length) };
  }

  async removeCost(accountId: string, expenseIdOrClientId: string) {
    const expense = await this.resolveExpense(accountId, expenseIdOrClientId);
    const { count } = await this.prisma.petCost.deleteMany({ where: { expenseId: expense.id, accountId } });
    if (count === 0) throw new NotFoundException('Pet cost not found');
    return { success: true };
  }

  async listCosts(accountId: string, petId: string) {
    await this.findOne(accountId, petId);
    return this.prisma.petCost.findMany({
      where: { accountId, petId, expense: { accountId, isDeleted: false } },
      include: { expense: { select: EXPENSE_SELECT } },
      orderBy: { expense: { date: 'desc' } },
    });
  }

  /** One period of costs by month and kind in the display currency, plus the current calendar year's total. */
  async getHistory(
    accountId: string,
    petId: string,
    months: number,
    baseCurrency = 'USD',
    now: Date = new Date(),
  ): Promise<PetHistory & { yearTotal: number; currencyCode: string; fxApproximate: boolean }> {
    await this.findOne(accountId, petId);
    const rows = await this.prisma.petCost.findMany({
      where: { accountId, petId, expense: { accountId, isDeleted: false } },
      include: { expense: { select: EXPENSE_SELECT } },
    });
    const rates = rows.some((r) => r.expense.currencyCode !== baseCurrency)
      ? await getRatesSafe(this.exchangeRateService, baseCurrency)
      : null;
    let fxApproximate = false;
    const inputs = rows.map((r) => {
      const amount = Number(r.expense.amount);
      const amountBase = convertAmount(amount, r.expense.currencyCode, baseCurrency, rates);
      if (amountBase === null) fxApproximate = true;
      return {
        expenseId: r.expense.id,
        clientId: r.expense.clientId,
        date: new Date(r.expense.date),
        amount,
        currencyCode: r.expense.currencyCode,
        amountBase,
        merchant: r.expense.merchant,
        description: r.expense.description,
        kind: r.kind,
      };
    });
    const history = computePetHistory(inputs, months, now);
    const yearStart = Date.UTC(now.getUTCFullYear(), 0, 1);
    const yearTotal =
      Math.round(
        inputs.filter((i) => i.date.getTime() >= yearStart && i.amountBase !== null).reduce((s, i) => s + (i.amountBase ?? 0), 0) * 100,
      ) / 100;
    return { ...history, yearTotal, currencyCode: baseCurrency, fxApproximate };
  }
}

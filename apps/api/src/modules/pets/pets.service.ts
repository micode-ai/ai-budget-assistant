import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExchangeRateService } from '../currency-exchange/exchange-rate.service';
import { convertAmount, getRatesSafe } from '../../common/utils/fx';
import { BulkPetCostDto, CreatePetDto, PetCategoryRuleDto, SetPetCostDto, UpdatePetDto } from './dto';
import { computePetHistory, PetHistory } from './pet-history.util';
import {
  applyPetCategoryRules,
  parsePetCategoryRules,
  PET_COST_NONE,
  type PetCategoryRule,
  type PetCostKind,
} from './pet-cost-rules.util';

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

  async create(accountId: string, userId: string, dto: CreatePetDto) {
    const categoryRules = dto.categoryRules ? await this.resolveRules(accountId, dto.categoryRules) : [];
    const pet = await this.prisma.pet.create({
      data: {
        accountId,
        userId,
        name: dto.name.trim(),
        species: dto.species ?? 'dog',
        birthday: dto.birthday ? toDateOnly(dto.birthday) : null,
        nextVaccinationDate: dto.nextVaccinationDate ? toDateOnly(dto.nextVaccinationDate) : null,
        nextParasiteTreatmentDate: dto.nextParasiteTreatmentDate ? toDateOnly(dto.nextParasiteTreatmentDate) : null,
        categoryRules: categoryRules,
      },
    });
    if (categoryRules.length === 0) return pet;
    return { ...pet, rulesApplied: await applyPetCategoryRules(this.prisma, accountId) };
  }

  async findOne(accountId: string, id: string) {
    const p = await this.prisma.pet.findFirst({ where: { id, accountId, isDeleted: false } });
    if (!p) throw new NotFoundException('Pet not found');
    return p;
  }

  async update(accountId: string, id: string, dto: UpdatePetDto) {
    await this.findOne(accountId, id);
    const categoryRules = dto.categoryRules ? await this.resolveRules(accountId, dto.categoryRules) : undefined;
    const pet = await this.prisma.pet.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.species !== undefined && { species: dto.species }),
        ...(dto.birthday !== undefined && { birthday: toDateOnly(dto.birthday) }),
        ...(dto.nextVaccinationDate !== undefined && { nextVaccinationDate: toDateOnly(dto.nextVaccinationDate) }),
        ...(dto.nextParasiteTreatmentDate !== undefined && {
          nextParasiteTreatmentDate: toDateOnly(dto.nextParasiteTreatmentDate),
        }),
        ...(categoryRules !== undefined && { categoryRules: categoryRules }),
      },
    });
    if (categoryRules === undefined) return pet;
    // Applied at once, so the pet screen shows the claimed expenses straight after saving.
    return { ...pet, rulesApplied: await applyPetCategoryRules(this.prisma, accountId) };
  }

  async remove(accountId: string, id: string) {
    await this.findOne(accountId, id);
    await this.prisma.pet.update({ where: { id }, data: { isDeleted: true } });
    // A deleted pet no longer claims its categories: release its rule rows.
    await applyPetCategoryRules(this.prisma, accountId);
    return { success: true };
  }

  /**
   * Category ids may be PKs or a device's clientId; only live EXPENSE
   * categories the account can see are accepted, and the resolved PK is what
   * is stored (ABA-833).
   */
  private async resolveRules(accountId: string, input: PetCategoryRuleDto[]): Promise<PetCategoryRule[]> {
    const rules: PetCategoryRule[] = [];
    for (const r of input) {
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
      if (!rules.some((x) => x.categoryId === cat.id)) rules.push({ categoryId: cat.id, kind: r.kind as PetCostKind });
    }
    return rules;
  }

  /**
   * The pet's rules with every spelling of each category (PK and the device's
   * clientId), so a phone that knows a category by its local id matches it
   * (category-id-resolution).
   */
  async getCategoryRules(accountId: string, petId: string) {
    const pet = await this.findOne(accountId, petId);
    const rules = parsePetCategoryRules(pet.categoryRules);
    if (rules.length === 0) return { rules: [] };
    const rows = await this.prisma.category.findMany({
      where: { id: { in: rules.map((r) => r.categoryId) } },
      select: { id: true, clientId: true },
    });
    const clientOf = new Map(rows.map((r) => [r.id, r.clientId]));
    return {
      rules: rules.map((r) => {
        const clientId = clientOf.get(r.categoryId);
        return { ...r, ids: [r.categoryId, ...(clientId ? [clientId] : [])] };
      }),
    };
  }

  /**
   * The pet cost on one expense (PK or clientId), or null. The expense screen
   * asks this for every expense, so "none" is an answer, not a 404; a `none`
   * tombstone reads as no pet.
   */
  async findCostForExpense(accountId: string, expenseIdOrClientId: string) {
    const cost = await this.prisma.petCost.findFirst({
      where: {
        accountId,
        kind: { not: PET_COST_NONE },
        expense: { accountId, isDeleted: false, OR: [{ id: expenseIdOrClientId }, { clientId: expenseIdOrClientId }] },
        pet: { isDeleted: false },
      },
      select: { petId: true, kind: true, source: true },
    });
    return { cost };
  }

  private async resolveExpense(accountId: string, expenseIdOrClientId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: expenseIdOrClientId }, { clientId: expenseIdOrClientId }] },
      select: { id: true, categoryId: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  /** A person's decision (`source: null`): a category rule never overwrites it. */
  async setCost(accountId: string, petId: string, expenseIdOrClientId: string, dto: SetPetCostDto) {
    await this.findOne(accountId, petId);
    const expense = await this.resolveExpense(accountId, expenseIdOrClientId);
    return this.prisma.petCost.upsert({
      where: { expenseId: expense.id },
      create: { accountId, petId, expenseId: expense.id, kind: dto.kind, source: null },
      update: { petId, kind: dto.kind, source: null },
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
        create: { accountId, petId, expenseId: e.id, kind: dto.kind, source: null },
        update: { petId, kind: dto.kind, source: null },
      });
    }
    return { assigned: expenses.length, notFound: Math.max(0, ids.length - expenses.length) };
  }

  /**
   * Takes the pet cost off an expense (ABA-833). When a pet's category rule
   * claims the expense's category, the row stays as a `none` tombstone set by
   * a person, so the rule does not put it back; otherwise it is deleted.
   */
  async removeCost(accountId: string, expenseIdOrClientId: string) {
    const expense = await this.resolveExpense(accountId, expenseIdOrClientId);
    const existing = await this.prisma.petCost.findFirst({ where: { expenseId: expense.id, accountId } });
    if (!existing || existing.kind === PET_COST_NONE) throw new NotFoundException('Pet cost not found');
    if (await this.isClaimedByRule(accountId, expense.categoryId)) {
      await this.prisma.petCost.update({ where: { id: existing.id }, data: { kind: PET_COST_NONE, source: null } });
    } else {
      await this.prisma.petCost.delete({ where: { id: existing.id } });
    }
    return { success: true };
  }

  private async isClaimedByRule(accountId: string, categoryId: string | null): Promise<boolean> {
    if (!categoryId) return false;
    const pets = await this.prisma.pet.findMany({
      where: { accountId, isDeleted: false },
      select: { categoryRules: true },
    });
    return pets.some((p) => parsePetCategoryRules(p.categoryRules).some((r) => r.categoryId === categoryId));
  }

  async listCosts(accountId: string, petId: string) {
    await this.findOne(accountId, petId);
    return this.prisma.petCost.findMany({
      where: { accountId, petId, kind: { not: PET_COST_NONE }, expense: { accountId, isDeleted: false } },
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
      // A `none` tombstone is a person's "not a pet cost", never a cost.
      where: { accountId, petId, kind: { not: PET_COST_NONE }, expense: { accountId, isDeleted: false } },
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

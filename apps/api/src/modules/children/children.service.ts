import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Child as ChildRow, PrismaClient } from '@prisma/client';
import type { Child, ChildSuggestionsResponse, ExpenseChildLink } from '@budget/shared-types';
import { PrismaService } from '../../database/prisma.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { touchExpenses } from '../expenses/expense-touch.util';
import { ChildProductRulesService } from './child-product-rules.service';
import { CreateChildDto, SetExpenseChildrenDto, UpdateChildDto } from './dto';

/** Child as returned to clients; the ciphertext rides along so an E2EE device can decrypt the name. */
export type ChildResponse = Child & {
  encryptedPayload: string | null;
  encryptionKeyVersion: number | null;
};

const SHARE_SCALE = 10_000; // ExpenseChild.share is Decimal(5, 4)
const SHARE_TOLERANCE = 0.001;

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';

/** Equal shares at the column's 4-decimal precision that sum to exactly 1 (remainder on the first). */
export function equalShares(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(SHARE_SCALE / n);
  const units = Array.from({ length: n }, () => base);
  units[0] += SHARE_SCALE - base * n;
  return units.map((u) => u / SHARE_SCALE);
}

/**
 * Children and their attribution (child costs). Account-scoped: every query
 * filters by `accountId`; every client-supplied id is resolved
 * `OR:[{id},{clientId}]` and only the resolved server PK is written.
 *
 * Whole-expense attribution (`ExpenseChild`) and line attribution
 * (`ExpenseItem.childId`) are mutually exclusive per expense — the last action
 * wins: setting whole-expense children clears every line's child, and setting a
 * line's child soft-deletes the whole-expense links.
 *
 * Child names are personal data of minors: never logged here.
 */
@Injectable()
export class ChildrenService {
  private readonly logger = new Logger(ChildrenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly productRules: ChildProductRulesService,
  ) {}

  toChild(row: ChildRow): ChildResponse {
    return {
      id: row.id,
      accountId: row.accountId,
      clientId: row.clientId ?? undefined,
      name: row.name,
      color: row.color ?? undefined,
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
      encryptedPayload: row.encryptedPayload ?? null,
      encryptionKeyVersion: row.encryptionKeyVersion ?? null,
    };
  }

  async findAll(accountId: string, includeArchived = false): Promise<ChildResponse[]> {
    const rows = await this.prisma.child.findMany({
      where: { accountId, isDeleted: false, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toChild(r));
  }

  /** A live child of this account by server PK or clientId; 404 otherwise. Archived children resolve. */
  async findOne(accountId: string, idOrClientId: string): Promise<ChildRow> {
    const child = await this.prisma.child.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: idOrClientId }, { clientId: idOrClientId }] },
    });
    if (!child) throw new NotFoundException('Child not found');
    return child;
  }

  /**
   * Idempotent on `(accountId, name)` — the `TagsService.create` rule: a second
   * create of the same name returns the existing row, and the device's clientId
   * is adopted only when the row has none (never overwritten, or the first
   * device's references would orphan). A retry carrying a clientId the server
   * already knows returns that child even if it was renamed since.
   */
  async create(accountId: string, userId: string, dto: CreateChildDto): Promise<ChildResponse> {
    void userId;
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Child name is required');

    if (dto.clientId) {
      // Live rows only: a soft-deleted child is revived through the name upsert below, never returned as-is.
      const known = await this.prisma.child.findFirst({ where: { accountId, clientId: dto.clientId, isDeleted: false } });
      if (known) return this.toChild(known);
    }

    let row: ChildRow;
    try {
      row = await this.prisma.child.upsert({
        where: { accountId_name: { accountId, name } },
        create: { accountId, name, color: dto.color, clientId: dto.clientId },
        // A soft-deleted child of the same name comes back rather than blocking the name.
        update: { isDeleted: false },
      });
    } catch (e) {
      // Concurrent create of the same name/clientId (upsert is not atomic, ABA-314).
      if (!isUniqueViolation(e)) throw e;
      const raced = await this.prisma.child.findFirst({
        where: { accountId, isDeleted: false, OR: [{ name }, ...(dto.clientId ? [{ clientId: dto.clientId }] : [])] },
      });
      if (!raced) throw e;
      row = raced;
    }

    if (dto.clientId && row.clientId == null) {
      row = await this.prisma.child.update({ where: { id: row.id }, data: { clientId: dto.clientId } });
    }
    return this.toChild(row);
  }

  async update(accountId: string, userId: string, id: string, dto: UpdateChildDto): Promise<ChildResponse> {
    void userId;
    const existing = await this.findOne(accountId, id);
    const name = dto.name?.trim();
    try {
      const updated = await this.prisma.child.update({
        where: { id: existing.id },
        data: {
          ...(name ? { name } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.archived !== undefined ? { archivedAt: dto.archived ? new Date() : null } : {}),
          syncVersion: { increment: 1 },
        },
      });
      return this.toChild(updated);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('A child with this name already exists');
      throw e;
    }
  }

  private async resolveExpensePk(accountId: string, idOrClientId: string): Promise<string> {
    const expense = await this.prisma.expense.findFirst({
      where: { accountId, isDeleted: false, OR: [{ id: idOrClientId }, { clientId: idOrClientId }] },
      select: { id: true },
    });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense.id;
  }

  private validateShares(n: number, shares: number[] | undefined): number[] {
    if (shares === undefined) return equalShares(n);
    if (shares.length !== n) throw new BadRequestException('shares must have one entry per child');
    if (shares.some((s) => !Number.isFinite(s) || s <= 0 || s > 1)) {
      throw new BadRequestException('shares must each be greater than 0 and at most 1');
    }
    const sum = shares.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > SHARE_TOLERANCE) throw new BadRequestException('shares must sum to 1');
    return shares;
  }

  /**
   * Replace the whole-expense attribution of one expense: links not in the new
   * set are soft-deleted, the rest upserted (equal shares unless given). A
   * non-empty set wins over line attribution: every line's child is cleared.
   * An empty set only removes the links and leaves lines alone.
   */
  async setExpenseChildren(
    accountId: string,
    userId: string,
    expenseId: string,
    dto: SetExpenseChildrenDto,
  ): Promise<ExpenseChildLink[]> {
    void userId;
    const expensePk = await this.resolveExpensePk(accountId, expenseId);

    const childPks: string[] = [];
    for (const raw of dto.childIds) {
      const child = await this.findOne(accountId, raw);
      if (childPks.includes(child.id)) throw new BadRequestException('Each child may appear once');
      childPks.push(child.id);
    }
    const shares = this.validateShares(childPks.length, dto.shares);

    await this.prisma.$transaction(async (tx: PrismaClient) => {
      await tx.expenseChild.updateMany({
        where: { expenseId: expensePk, isDeleted: false, childId: { notIn: childPks } },
        data: { isDeleted: true, syncVersion: { increment: 1 } },
      });
      for (let i = 0; i < childPks.length; i++) {
        await tx.expenseChild.upsert({
          where: { expenseId_childId: { expenseId: expensePk, childId: childPks[i] } },
          create: { expenseId: expensePk, childId: childPks[i], share: shares[i] },
          update: { share: shares[i], isDeleted: false, syncVersion: { increment: 1 } },
        });
      }
      if (childPks.length > 0) {
        await tx.expenseItem.updateMany({
          where: { expenseId: expensePk, childId: { not: null } },
          data: { childId: null, syncVersion: { increment: 1 } },
        });
      }
      // Only link/child rows changed; bump the parent so change feeds re-deliver it.
      await touchExpenses(tx, accountId, { id: expensePk });
    });

    return childPks.map((childId, i) => ({ expenseId: expensePk, childId, share: shares[i] }));
  }

  /**
   * Attribute one receipt line to a child (or clear it with `null`). Setting a
   * child wins over whole-expense attribution (its links are soft-deleted) and
   * teaches a product → child rule, fire-and-forget, so a failing rule write
   * never fails the attribution.
   */
  async setItemChild(
    accountId: string,
    userId: string,
    expenseId: string,
    itemId: string,
    childId: string | null,
  ): Promise<void> {
    void userId;
    const expensePk = await this.resolveExpensePk(accountId, expenseId);
    // Items have no clientId: the device's item id IS the server id (sync creates with it).
    const item = await this.prisma.expenseItem.findFirst({
      where: { id: itemId, expenseId: expensePk, isDeleted: false },
    });
    if (!item) throw new NotFoundException('Expense item not found');

    const childPk = childId === null ? null : (await this.findOne(accountId, childId)).id;

    await this.prisma.$transaction(async (tx: PrismaClient) => {
      await tx.expenseItem.update({
        where: { id: item.id },
        data: { childId: childPk, syncVersion: { increment: 1 } },
      });
      if (childPk) {
        await tx.expenseChild.updateMany({
          where: { expenseId: expensePk, isDeleted: false },
          data: { isDeleted: true, syncVersion: { increment: 1 } },
        });
      }
      await touchExpenses(tx, accountId, { id: expensePk });
    });

    // An encrypted line's plaintext description is a placeholder — nothing to learn from.
    if (childPk && !item.encryptedPayload) {
      void this.productRules
        .learn(accountId, item.canonicalName ?? item.description, childPk)
        .catch(logFireAndForget(this.logger, 'ChildrenService.learnProductChildRule'));
    }
  }

  /** Learned suggestions for product names, keyed by normalized name; only non-archived children. */
  async suggestions(accountId: string, names: string[]): Promise<ChildSuggestionsResponse> {
    return this.productRules.suggest(accountId, names);
  }
}

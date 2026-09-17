import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import type { Category } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EmbeddingService } from '../ai/services/embedding.service';
import { CacheService } from '../../common/cache/cache.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly cacheService: CacheService,
  ) {}

  private invalidateChatCache(accountId: string): void {
    if (!accountId) return;
    void this.cacheService.delByPrefix(`chat:get_category_breakdown:${accountId}:`);
    void this.cacheService.delByPrefix(`chat:get_expenses:${accountId}:`);
  }

  async findAll(accountId: string) {
    // Get system categories and account's custom categories
    return this.prisma.category.findMany({
      where: {
        OR: [
          { isSystem: true },
          { accountId },
        ],
        isDeleted: false,
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  /**
   * A category with this name+type already exists. Live one: return it as-is —
   * an existing category IS the correct answer to "create" it, and copying the
   * incoming icon/color over would silently restyle a category the user has
   * already customised. Soft-deleted one: revive it with the incoming values.
   */
  private async reuseExisting(existing: Category, accountId: string, userId: string, dto: any) {
    if (!existing.isDeleted) return existing;

    const revived = await this.prisma.category.update({
      where: { id: existing.id },
      data: {
        isDeleted: false,
        icon: dto.icon,
        color: dto.color,
        parentId: dto.parentId,
        userId,
      },
    });
    // Fire-and-forget: refresh embedding so semantic match picks it up.
    void this.embeddingService.embedAndStore('category', revived.id, revived.name);
    this.invalidateChatCache(accountId);
    return revived;
  }

  async create(accountId: string, userId: string, dto: any) {
    // Callers outside the controller (AI create_category, all three bots) pass a
    // bare object, so `type` carries no DTO validation. Default it the same way
    // the schema does, or an undefined would drop the type filter from the
    // lookup below and match a same-named category of the OTHER type.
    const type = dto.type ?? 'expense';

    // Offline-first idempotency: the mobile client may resend the same create
    // (sync retry, double-tap, lost response) with the same clientId. Return
    // the already-created row instead of violating @@unique([accountId, clientId]).
    if (dto.clientId) {
      const byClientId = await this.prisma.category.findFirst({
        where: { accountId, clientId: dto.clientId },
      });
      if (byClientId) return byClientId;
    }

    // @@unique([accountId, name, type]) does not exclude soft-deleted rows, so
    // ANY existing row with this name+type blocks the insert — look for it
    // without filtering isDeleted. Only checking for soft-deleted ones (what
    // this did before) let a live duplicate fall through to create() and throw
    // P2002 as an unhandled 500: reachable from the app (same name typed
    // twice), from AI create_category, and from all three bots.
    const existing = await this.prisma.category.findFirst({
      where: { accountId, name: dto.name, type },
    });
    if (existing) return this.reuseExisting(existing, accountId, userId, dto);

    try {
      const created = await this.prisma.category.create({
        data: {
          accountId,
          userId,
          name: dto.name,
          icon: dto.icon,
          color: dto.color,
          type,
          parentId: dto.parentId,
          clientId: dto.clientId ?? undefined,
        },
      });
      void this.embeddingService.embedAndStore('category', created.id, created.name);
      this.invalidateChatCache(accountId);
      return created;
    } catch (e: any) {
      // A concurrent request won the race between the read above and this
      // insert (double-tap, an offline retry, an AI confirm racing a manual
      // add). Re-read and reuse instead of surfacing a 500. Safe to catch
      // here because there is no $transaction to poison (ABA-313).
      if (e?.code !== 'P2002') throw e;
      if (dto.clientId) {
        const racedByClientId = await this.prisma.category.findFirst({
          where: { accountId, clientId: dto.clientId },
        });
        if (racedByClientId) return racedByClientId;
      }
      const raced = await this.prisma.category.findFirst({
        where: { accountId, name: dto.name, type },
      });
      if (!raced) throw e;
      return this.reuseExisting(raced, accountId, userId, dto);
    }
  }

  /**
   * `identifier` is the server PK or the mobile's local clientId
   * (offline-first). Scoped to the account's own rows plus system categories.
   */
  private async resolveCategory(accountId: string, identifier: string) {
    return this.prisma.category.findFirst({
      where: {
        AND: [{ OR: [{ accountId }, { isSystem: true }] }, { OR: [{ id: identifier }, { clientId: identifier }] }],
      },
    });
  }

  /**
   * A rename collided with another of the account's categories. Deliberately a
   * 409 rather than a silent merge or a silent no-op: merging two categories
   * re-homes every expense, budget allocation and split behind them, which is
   * not a decision a PATCH should take on the user's behalf, and returning the
   * other category would answer a different question than the one asked.
   * Mirrors `remove()`'s existing conflict shape so the client reads both the
   * same way.
   *
   * `conflictIsDeleted` travels because the unique covers soft-deleted rows
   * too (ABA-392): "already exists" about a category the user deleted and can
   * no longer see is exactly the confusion that note documented, and only the
   * client can word it usefully.
   */
  private nameConflict(name: string, type: string, conflictIsDeleted: boolean | null) {
    return new ConflictException({
      statusCode: 409,
      message: 'A category with this name already exists',
      details: { name, type, conflictIsDeleted: conflictIsDeleted ?? false },
    });
  }

  async update(accountId: string, id: string, dto: any) {
    const category = await this.resolveCategory(accountId, id);
    if (!category) throw new NotFoundException('Category not found');
    const { clientId: _ignoredClientId, ...rest } = dto ?? {};

    // `@@unique([accountId, name, type])` covers BOTH columns this PATCH can
    // change, so a rename — or a type switch — onto another of the account's
    // categories violates it. `create` has guarded that since ABA-392; this
    // method never did, so the violation escaped as an unhandled P2002, i.e. a
    // 500, on a path the UI offers with no duplicate-name validation of its
    // own (ABA-565).
    const name = rest.name ?? category.name;
    const type = rest.type ?? category.type;
    // A system category carries `accountId: null`, and Postgres treats NULLs in
    // a unique as distinct, so the constraint cannot fire for one — probing
    // would reject what the database would accept.
    const touchesUnique = category.accountId != null && (name !== category.name || type !== category.type);

    if (touchesUnique) {
      // Excluding the row being edited is load-bearing: the edit form re-sends
      // `name` on every save, so a colour-only change would otherwise find
      // itself and reject a patch that changes nothing about the unique.
      const clash = await this.prisma.category.findFirst({
        where: { accountId: category.accountId, name, type, id: { not: category.id } },
      });
      if (clash) throw this.nameConflict(name, type, clash.isDeleted);
    }

    let updated: Category;
    try {
      updated = await this.prisma.category.update({
        where: { id: category.id },
        data: rest,
      });
    } catch (e: any) {
      // A concurrent write took the name between the probe and this update.
      // `clientId` is stripped above, so `@@unique([accountId, name, type])` is
      // the only constraint this write can trip. Safe to catch here because
      // there is no $transaction to poison (ABA-313), same backstop as
      // `create`. Reported as a live clash: nothing renames a row *into* a
      // deleted state, so a soft-deleted row cannot appear in this window.
      if (e?.code !== 'P2002') throw e;
      throw this.nameConflict(name, type, null);
    }

    if (rest.name && rest.name !== category.name) {
      // Name changed — refresh embedding.
      void this.embeddingService.embedAndStore('category', updated.id, updated.name);
    }
    this.invalidateChatCache(accountId);
    return updated;
  }

  async remove(accountId: string, id: string) {
    // System categories have accountId: null on server, but are seeded locally with accountId.
    // On the API side, system categories are global. Soft-deleting a system category
    // hides it for ALL accounts (findAll filters isDeleted: false).
    // This is intentional per spec — system categories can be deleted.
    // `id` may be the server PK or the mobile's local id — always act on the
    // RESOLVED row's PK (same rule as update).
    const category = await this.resolveCategory(accountId, id);
    if (!category) throw new NotFoundException('Category not found');
    const resolvedId = category.id;

    // Check for related records
    const [expenses, incomes, budgetCategories, splits, children] =
      await Promise.all([
        this.prisma.expense.count({
          where: { categoryId: resolvedId, isDeleted: false },
        }),
        this.prisma.income.count({
          where: { categoryId: resolvedId, isDeleted: false },
        }),
        this.prisma.budgetCategory.count({
          where: { categoryId: resolvedId, isDeleted: false },
        }),
        this.prisma.expenseCategorySplit.count({
          where: { categoryId: resolvedId, isDeleted: false },
        }),
        this.prisma.category.count({
          where: { parentId: resolvedId, isDeleted: false },
        }),
      ]);

    const total = expenses + incomes + budgetCategories + splits + children;
    if (total > 0) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Category has related records',
        details: { expenses, incomes, budgetCategories, splits, children },
      });
    }

    const removed = await this.prisma.category.update({
      where: { id: resolvedId },
      data: { isDeleted: true },
    });
    this.invalidateChatCache(accountId);
    return removed;
  }
}

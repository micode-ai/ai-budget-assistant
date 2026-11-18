import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { dropAccountFromGrants } from '../oauth/oauth-grant-accounts.util';
import { catalogKeyForName } from '../../common/utils/category-catalog';
import { getDefaultCategories } from './default-categories';
import { CreateAccountDto, UpdateAccountDto } from './dto';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: CacheService,
  ) {}

  async create(userId: string, dto: CreateAccountDto) {
    if (dto.type === 'trip') {
      if (!dto.tripEndDate) {
        throw new BadRequestException('tripEndDate is required for trip accounts');
      }
    }

    // Validate account type limits
    if (dto.type === 'personal' || dto.type === 'business' || dto.type === 'investment') {
      const existing = await this.prisma.account.findFirst({
        where: { ownerId: userId, type: dto.type, isActive: true },
      });
      if (existing) {
        throw new ConflictException(
          `You already have a ${dto.type} account. Only one ${dto.type} account is allowed.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const account = await tx.account.create({
        data: {
          name: dto.name,
          type: dto.type,
          currencyCode: dto.currencyCode || 'USD',
          ownerId: userId,
          icon: dto.icon,
          ...(dto.type === 'trip'
            ? {
                tripStartDate: dto.tripStartDate ? new Date(dto.tripStartDate) : new Date(),
                tripEndDate: new Date(dto.tripEndDate as string),
                tripStatus: 'active' as const,
              }
            : {}),
        },
      });

      await tx.accountMember.create({
        data: {
          accountId: account.id,
          userId,
          role: 'owner',
        },
      });

      // Seed default categories for every new account except `investment` —
      // portfolio-holdings-centric accounts have no use for a
      // Groceries/Alcohol/Household-style category set. Uses the creating
      // user's language, same field the first-account seed below reads.
      if (dto.type !== 'investment') {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { language: true },
        });
        await this.seedDefaultCategoriesForAccount(tx, account.id, user?.language ?? 'en');
      }

      return account;
    });
  }

  private async seedDefaultCategoriesForAccount(tx: PrismaClient, accountId: string, language: string) {
    const defaultCategories = getDefaultCategories(language);
    await tx.category.createMany({
      data: defaultCategories.map((cat) => ({
        accountId,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        type: cat.type ?? 'expense',
        // Seeded names come from the catalog, so the key is recoverable from
        // the name; this keeps getDefaultCategories' output shape unchanged.
        systemKey: catalogKeyForName(cat.name, cat.type ?? 'expense'),
      })),
    });
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.accountMember.findMany({
      where: {
        userId,
        account: {
          OR: [
            { isActive: true },
            // Include archived trips even if isActive was set to false during archiving
            { type: 'trip', tripStatus: 'archived' },
          ],
        },
      },
      include: {
        account: true,
      },
    });

    return memberships.map((m: typeof memberships[number]) => ({
      ...m.account,
      myRole: m.role,
    }));
  }

  async findOne(accountId: string, userId: string) {
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId } },
      include: {
        account: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Account not found');
    }

    return {
      ...membership.account,
      myRole: membership.role,
    };
  }

  async update(accountId: string, userId: string, dto: UpdateAccountDto) {
    await this.validateAccess(accountId, userId, 'owner');

    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        name: dto.name,
        currencyCode: dto.currencyCode,
        icon: dto.icon,
        monthAnchorDay: dto.monthAnchorDay,
      },
    });
    if (dto.monthAnchorDay !== undefined && this.cache) {
      // Cached figures computed against the old month boundary: Safe-to-Spend
      // (`sts:{account}:{currency}`, safe-to-spend.service.ts) and the chat
      // summary (`uc:{account}`, user-context-builder.service.ts). Without this
      // a new anchor shows up only when they expire (ABA-793).
      void Promise.all([
        this.cache.delByPrefix(`sts:${accountId}:`),
        this.cache.del(`uc:${accountId}`),
      ]).catch(logFireAndForget(this.logger, 'AccountsService.update#bustMonthCaches'));
    }
    return updated;
  }

  /**
   * Marks or unmarks one expense category as a fixed cost for this account
   * (ABA-777). Editors may (it is a reading lens, not an account setting);
   * viewers may not. Only a live EXPENSE category this account can see — its
   * own or a global system one — is accepted.
   *
   * A device addresses a category by its own id until the server's id reaches
   * it (docs/wiki/features/category-id-resolution.md), so `categoryId` may be
   * the server PK or the clientId. Both spellings are added together and
   * removed together, so the app recognises the category whichever id its
   * expenses carry, and unmarking from either side really unmarks it.
   */
  async setCategoryFixed(accountId: string, userId: string, categoryId: string, fixed: boolean) {
    await this.validateAccess(accountId, userId, 'editor');
    const category = await this.prisma.category.findFirst({
      where: {
        isDeleted: false,
        type: 'expense',
        AND: [
          { OR: [{ accountId }, { accountId: null }] },
          { OR: [{ id: categoryId }, { clientId: categoryId }] },
        ],
      },
      select: { id: true, clientId: true },
    });
    if (!category) throw new NotFoundException('Category not found');

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { fixedCategoryIds: true },
    });
    const spellings = [...new Set([categoryId, category.id, category.clientId].filter((v): v is string => !!v))];
    const current = account?.fixedCategoryIds ?? [];
    const fixedCategoryIds = fixed
      ? [...current, ...spellings.filter((id) => !current.includes(id))]
      : current.filter((id) => !spellings.includes(id));
    await this.prisma.account.update({ where: { id: accountId }, data: { fixedCategoryIds } });
    return { fixedCategoryIds };
  }

  async remove(accountId: string, userId: string) {
    await this.validateAccess(accountId, userId, 'owner');

    // Check if this is the user's default account
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { defaultAccountId: true },
    });

    if (user?.defaultAccountId === accountId) {
      throw new BadRequestException('Cannot delete your default account. Set a different default first.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id: accountId }, data: { isActive: false } });
      await dropAccountFromGrants(tx, accountId);
    });

    return { success: true };
  }

  async validateAccess(
    accountId: string,
    userId: string,
    requiredRole?: 'owner' | 'editor' | 'viewer',
  ) {
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId } },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have access to this account');
    }

    if (requiredRole) {
      const roleHierarchy = { owner: 3, editor: 2, viewer: 1 };
      if (roleHierarchy[membership.role as keyof typeof roleHierarchy] < roleHierarchy[requiredRole]) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    return membership;
  }

  // ---- Trip lifecycle ----

  async archiveTrip(accountId: string, userId: string, force?: boolean) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, ownerId: userId },
    });
    if (!account) {
      throw new ForbiddenException('Only the trip owner can archive it');
    }

    if (!force) {
      const unconfirmed = await this.prisma.settleUpTransaction.count({
        where: { accountId, status: 'pending' },
      });
      if (unconfirmed > 0) {
        throw new BadRequestException(
          'There are unconfirmed settle-up transactions — pass force to archive anyway',
        );
      }
    }

    return this.prisma.account.update({
      where: { id: accountId },
      data: { tripStatus: 'archived' },
    });
  }

  // ---- Helper for auto-creating default account ----

  async createDefaultAccount(userId: string, currencyCode: string, language = 'en') {
    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const account = await tx.account.create({
        data: {
          name: 'Personal',
          type: 'personal',
          currencyCode,
          ownerId: userId,
        },
      });

      await tx.accountMember.create({
        data: {
          accountId: account.id,
          userId,
          role: 'owner',
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { defaultAccountId: account.id },
      });

      // Seed default categories for the new account (localized)
      await this.seedDefaultCategoriesForAccount(tx, account.id, language);

      return account;
    });
  }
}

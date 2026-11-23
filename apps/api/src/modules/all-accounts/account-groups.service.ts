import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AccountGroupDto, UpsertAccountGroupDto } from '@budget/shared-types';

export const MAX_GROUPS_PER_USER = 20;

type GroupRow = { id: string; name: string; accounts: { accountId: string }[] };

/**
 * User-scoped saved sets of accounts for the all-accounts analytics. Groups
 * are filters over the caller's memberships, never an allow-list: every read
 * re-filters the stored account ids by current membership.
 */
@Injectable()
export class AccountGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  private async memberIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.accountMember.findMany({ where: { userId }, select: { accountId: true } });
    return new Set(rows.map((r) => r.accountId));
  }

  private toDto(g: GroupRow, members: Set<string>): AccountGroupDto {
    return { id: g.id, name: g.name, accountIds: g.accounts.map((a) => a.accountId).filter((id) => members.has(id)) };
  }

  /** Dedupes and requires membership of every id (403 otherwise). */
  private async checkedAccountIds(userId: string, dto: UpsertAccountGroupDto): Promise<string[]> {
    const ids = [...new Set(dto.accountIds)];
    const members = await this.memberIds(userId);
    if (ids.some((id) => !members.has(id))) throw new ForbiddenException('Not a member of that account');
    return ids;
  }

  private async findOwned(userId: string, id: string) {
    const g = await this.prisma.accountGroup.findFirst({
      where: { id, userId },
      include: { accounts: { select: { accountId: true } } },
    });
    if (!g) throw new NotFoundException('Group not found');
    return g;
  }

  async list(userId: string): Promise<AccountGroupDto[]> {
    const [groups, members] = await Promise.all([
      this.prisma.accountGroup.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        include: { accounts: { select: { accountId: true } } },
      }),
      this.memberIds(userId),
    ]);
    return groups.map((g) => this.toDto(g, members));
  }

  async create(userId: string, dto: UpsertAccountGroupDto): Promise<AccountGroupDto> {
    if ((await this.prisma.accountGroup.count({ where: { userId } })) >= MAX_GROUPS_PER_USER) {
      throw new BadRequestException('GROUP_LIMIT');
    }
    const ids = await this.checkedAccountIds(userId, dto);
    const g = await this.prisma.accountGroup.create({
      data: { userId, name: dto.name.trim(), accounts: { create: ids.map((accountId) => ({ accountId })) } },
      include: { accounts: { select: { accountId: true } } },
    });
    return { id: g.id, name: g.name, accountIds: g.accounts.map((a) => a.accountId) };
  }

  async update(userId: string, id: string, dto: UpsertAccountGroupDto): Promise<AccountGroupDto> {
    await this.findOwned(userId, id);
    const ids = await this.checkedAccountIds(userId, dto);
    const g = await this.prisma.accountGroup.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        accounts: { deleteMany: {}, create: ids.map((accountId) => ({ accountId })) },
      },
      include: { accounts: { select: { accountId: true } } },
    });
    return { id: g.id, name: g.name, accountIds: g.accounts.map((a) => a.accountId) };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOwned(userId, id);
    await this.prisma.accountGroup.delete({ where: { id } });
  }

  /** The group's accounts still in the caller's memberships; 404 when the group is not theirs. */
  async resolveAccountIds(userId: string, id: string): Promise<string[]> {
    const [g, members] = await Promise.all([this.findOwned(userId, id), this.memberIds(userId)]);
    return this.toDto(g, members).accountIds;
  }
}

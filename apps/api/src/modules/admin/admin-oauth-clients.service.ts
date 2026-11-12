import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type { AdminOAuthClient, AdminOAuthClientPage, UpdateAdminOAuthClientDto } from '@budget/shared-types';

const MAX_LIMIT = 100_000;
const MAX_REASON = 300;
const SOURCES = ['manual', 'mcp_dcr'] as const;
export const ADMIN_OAUTH_CLIENTS_DEFAULT_LIMIT = 50;
export const ADMIN_OAUTH_CLIENTS_MAX_LIMIT = 200;

/** A positive integer query value, or the fallback when absent; anything else is a 400. */
function positiveInt(raw: string | number | undefined, name: string, fallback: number, max?: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = typeof raw === 'number' ? raw : /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(n) || n < 1 || (max !== undefined && n > max)) {
    throw new BadRequestException(
      max === undefined ? `${name} must be a positive integer` : `${name} must be an integer between 1 and ${max}`,
    );
  }
  return n;
}

@Injectable()
export class AdminOAuthClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * One page of API apps, newest first (default 50, at most 200 per page). Dynamic registration is
   * open to anyone, so this table can grow without bound: the list is paginated, and the live
   * request counter (one Redis read per row) is read only for the rows of the returned page.
   */
  async list(
    source?: string,
    page?: string | number,
    limit?: string | number,
  ): Promise<AdminOAuthClientPage> {
    if (source !== undefined && !(SOURCES as readonly string[]).includes(source)) {
      throw new BadRequestException('source must be manual or mcp_dcr');
    }
    const pageNo = positiveInt(page, 'page', 1);
    const take = positiveInt(limit, 'limit', ADMIN_OAUTH_CLIENTS_DEFAULT_LIMIT, ADMIN_OAUTH_CLIENTS_MAX_LIMIT);
    const where = source ? { source: source as (typeof SOURCES)[number] } : {};
    const [total, rows] = await Promise.all([
      this.prisma.oAuthClient.count({ where }),
      this.prisma.oAuthClient.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (pageNo - 1) * take,
        take,
        include: { owner: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    const ids = rows.map((r) => r.id);
    const grants = ids.length
      ? await this.prisma.oAuthGrant.groupBy({
          by: ['clientId'],
          where: { clientId: { in: ids }, revokedAt: null },
          _count: { _all: true },
        })
      : [];
    const grantCount = new Map(grants.map((g) => [g.clientId, g._count._all]));
    const items: AdminOAuthClient[] = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        homepageUrl: r.homepageUrl,
        source: r.source,
        ownerId: r.owner?.id ?? null,
        ownerName: r.owner?.name ?? null,
        ownerEmail: r.owner?.email ?? null,
        createdAt: r.createdAt.toISOString(),
        activeGrants: grantCount.get(r.id) ?? 0,
        requestsLastMinute: await this.cache.peekWindow(`pa:c:${r.id}`).catch(() => 0),
        status: r.status,
        blockedReason: r.blockedReason,
        isVerified: r.isVerified,
        rateLimitPerGrant: r.rateLimitPerGrant,
        rateLimitPerClient: r.rateLimitPerClient,
        isDeleted: r.deletedAt !== null,
      })),
    );
    return { items, total, page: pageNo, limit: take, totalPages: Math.max(1, Math.ceil(total / take)) };
  }

  /** Returns what changed (for the audit entry). Blocking never revokes grants (spec 10). */
  async update(id: string, dto: UpdateAdminOAuthClientDto): Promise<Record<string, unknown>> {
    const client = await this.prisma.oAuthClient.findUnique({ where: { id } });
    if (!client) throw new NotFoundException('API app not found');
    if (client.deletedAt) throw new ConflictException('API app is deleted');

    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) {
      if (dto.status !== 'active' && dto.status !== 'blocked') {
        throw new BadRequestException('status must be active or blocked');
      }
      if (dto.status === 'blocked') {
        const reason = typeof dto.blockedReason === 'string' ? dto.blockedReason.trim() : '';
        if (!reason) throw new BadRequestException('blockedReason is required when blocking');
        if (reason.length > MAX_REASON) {
          throw new BadRequestException(`blockedReason must be at most ${MAX_REASON} characters`);
        }
        data.status = 'blocked';
        data.blockedReason = reason;
      } else {
        data.status = 'active';
        data.blockedReason = null;
      }
    }
    if (dto.isVerified !== undefined) {
      if (typeof dto.isVerified !== 'boolean') throw new BadRequestException('isVerified must be boolean');
      data.isVerified = dto.isVerified;
    }
    for (const key of ['rateLimitPerGrant', 'rateLimitPerClient'] as const) {
      const v = dto[key];
      if (v === undefined) continue;
      if (v !== null && (!Number.isInteger(v) || v < 1 || v > MAX_LIMIT)) {
        throw new BadRequestException(`${key} must be an integer between 1 and ${MAX_LIMIT}, or null`);
      }
      data[key] = v;
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to update');

    await this.prisma.oAuthClient.update({ where: { id }, data });
    return data;
  }
}

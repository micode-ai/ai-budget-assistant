import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type { AdminOAuthClient, UpdateAdminOAuthClientDto } from '@budget/shared-types';

const MAX_LIMIT = 100_000;
const MAX_REASON = 300;

@Injectable()
export class AdminOAuthClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(): Promise<AdminOAuthClient[]> {
    const rows = await this.prisma.oAuthClient.findMany({
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
    const ids = rows.map((r) => r.id);
    const grants = ids.length
      ? await this.prisma.oAuthGrant.groupBy({
          by: ['clientId'],
          where: { clientId: { in: ids }, revokedAt: null },
          _count: { _all: true },
        })
      : [];
    const grantCount = new Map(grants.map((g) => [g.clientId, g._count._all]));
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        name: r.name,
        homepageUrl: r.homepageUrl,
        ownerId: r.owner.id,
        ownerName: r.owner.name,
        ownerEmail: r.owner.email,
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

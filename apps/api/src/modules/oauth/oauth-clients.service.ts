import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { OAuthClient } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { generateClientId, generateToken, safeEqual, sha256Hex } from './oauth-crypto.util';
import { CreateDeveloperAppDto, UpdateDeveloperAppDto } from './dto/developer-app.dto';

export const MAX_APPS_PER_DEVELOPER = 10;

export interface DeveloperAppView {
  id: string;
  clientId: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  homepageUrl: string;
  privacyPolicyUrl: string | null;
  redirectUris: string[];
  isConfidential: boolean;
  status: string;
  blockedReason: string | null;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  connectedUsers?: number;
  lastUsedAt?: Date | null;
}

/** Owner-facing shape of an app. Built field by field so secretHash can never leak. */
export function toDeveloperAppView(c: OAuthClient): DeveloperAppView {
  return {
    id: c.id,
    clientId: c.clientId,
    name: c.name,
    description: c.description,
    logoUrl: c.logoUrl,
    homepageUrl: c.homepageUrl,
    privacyPolicyUrl: c.privacyPolicyUrl,
    redirectUris: c.redirectUris,
    isConfidential: c.isConfidential,
    status: c.status,
    blockedReason: c.blockedReason,
    isVerified: c.isVerified,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

@Injectable()
export class OAuthClientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Null when unknown or soft-deleted. The caller checks `status` (blocked apps resolve here). */
  findActiveByClientId(clientId: string): Promise<OAuthClient | null> {
    return this.prisma.oAuthClient.findFirst({ where: { clientId, deletedAt: null } });
  }

  /** Constant-time comparison of sha256 hashes. Public clients have no secret and never verify. */
  verifySecret(client: OAuthClient, secret: string): boolean {
    if (!client.secretHash || typeof secret !== 'string' || secret.length === 0) return false;
    return safeEqual(sha256Hex(secret), client.secretHash);
  }

  async create(userId: string, dto: CreateDeveloperAppDto) {
    const count = await this.prisma.oAuthClient.count({
      where: { ownerUserId: userId, deletedAt: null },
    });
    if (count >= MAX_APPS_PER_DEVELOPER) throw new BadRequestException('app_limit_reached');

    const isConfidential = dto.isConfidential ?? true;
    const clientSecret = isConfidential ? generateToken('aba_cs_') : undefined;
    const created = await this.prisma.oAuthClient.create({
      data: {
        clientId: generateClientId(),
        secretHash: clientSecret ? sha256Hex(clientSecret) : null,
        isConfidential,
        ownerUserId: userId,
        name: dto.name,
        description: dto.description ?? null,
        logoUrl: dto.logoUrl ?? null,
        homepageUrl: dto.homepageUrl,
        privacyPolicyUrl: dto.privacyPolicyUrl ?? null,
        redirectUris: dto.redirectUris,
      },
    });
    return { app: toDeveloperAppView(created), ...(clientSecret ? { clientSecret } : {}) };
  }

  async listForOwner(userId: string): Promise<DeveloperAppView[]> {
    const clients = await this.prisma.oAuthClient.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { grants: { where: { revokedAt: null }, select: { lastUsedAt: true } } },
    });
    return clients.map((c) => {
      const { grants, ...client } = c;
      let last: Date | null = null;
      for (const g of grants) {
        if (g.lastUsedAt && (!last || g.lastUsedAt > last)) last = g.lastUsedAt;
      }
      return { ...toDeveloperAppView(client as OAuthClient), connectedUsers: grants.length, lastUsedAt: last };
    });
  }

  async update(userId: string, id: string, dto: UpdateDeveloperAppDto) {
    await this.getOwned(userId, id);
    const updated = await this.prisma.oAuthClient.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.homepageUrl !== undefined && { homepageUrl: dto.homepageUrl }),
        ...(dto.privacyPolicyUrl !== undefined && { privacyPolicyUrl: dto.privacyPolicyUrl }),
        ...(dto.redirectUris !== undefined && { redirectUris: dto.redirectUris }),
      },
    });
    return { app: toDeveloperAppView(updated) };
  }

  async rotateSecret(userId: string, id: string) {
    const client = await this.getOwned(userId, id);
    if (!client.isConfidential) throw new BadRequestException('public_client_has_no_secret');
    const clientSecret = generateToken('aba_cs_');
    await this.prisma.oAuthClient.update({
      where: { id },
      data: { secretHash: sha256Hex(clientSecret) },
    });
    return { clientSecret };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.oAuthToken.deleteMany({ where: { grant: { clientId: id } } }),
      this.prisma.oAuthGrant.updateMany({
        where: { clientId: id, revokedAt: null },
        data: { revokedAt: now, revokedBy: 'client_deleted' },
      }),
      this.prisma.oAuthClient.update({ where: { id }, data: { deletedAt: now } }),
    ]);
  }

  private async getOwned(userId: string, id: string): Promise<OAuthClient> {
    const client = await this.prisma.oAuthClient.findFirst({
      where: { id, ownerUserId: userId, deletedAt: null },
    });
    if (!client) throw new NotFoundException('App not found');
    return client;
  }
}

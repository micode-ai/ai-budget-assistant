import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AppPlatform } from '@prisma/client';
import { compareSemver } from './utils/semver';
import type { AppVersionCheckResponse } from '@budget/shared-types';
import type { CreateAppVersionDto, UpdateAppVersionDto } from './dto';

const DEFAULT_STORE_URLS: Record<AppPlatform, string> = {
  android: 'https://play.google.com/store/apps/details?id=com.budget.assistant',
  // Placeholder — admin must set per-row storeUrl until App Store ID is assigned.
  ios: 'https://apps.apple.com/app/id000000000',
};

@Injectable()
export class AppVersionsService {
  constructor(private readonly prisma: PrismaService) {}

  async check(platform: AppPlatform, clientVersion: string): Promise<AppVersionCheckResponse> {
    const row = await this.prisma.appVersion.findFirst({
      where: { platform },
      orderBy: { publishedAt: 'desc' },
    });

    if (!row) {
      return {
        latestVersion: clientVersion,
        minSupportedVersion: clientVersion,
        isUpdateAvailable: false,
        isUpdateRequired: false,
        releaseNotes: null,
        storeUrl: DEFAULT_STORE_URLS[platform],
      };
    }

    return {
      latestVersion: row.latestVersion,
      minSupportedVersion: row.minSupportedVersion,
      isUpdateAvailable: compareSemver(clientVersion, row.latestVersion) < 0,
      isUpdateRequired: compareSemver(clientVersion, row.minSupportedVersion) < 0,
      releaseNotes: (row.releaseNotes as Record<string, string> | null) ?? null,
      storeUrl: row.storeUrl,
    };
  }

  async list() {
    return this.prisma.appVersion.findMany({
      orderBy: [{ platform: 'asc' }, { publishedAt: 'desc' }],
    });
  }

  async create(dto: CreateAppVersionDto) {
    if (compareSemver(dto.latestVersion, dto.minSupportedVersion) < 0) {
      throw new BadRequestException('latestVersion must be >= minSupportedVersion');
    }
    return this.prisma.appVersion.create({
      data: {
        platform: dto.platform,
        latestVersion: dto.latestVersion,
        minSupportedVersion: dto.minSupportedVersion,
        releaseNotes: dto.releaseNotes ?? undefined,
        storeUrl: dto.storeUrl,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
      },
    });
  }

  async update(id: string, dto: UpdateAppVersionDto) {
    const existing = await this.prisma.appVersion.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException(`AppVersion ${id} not found`);
    const next = { ...existing, ...dto };
    if (compareSemver(next.latestVersion, next.minSupportedVersion) < 0) {
      throw new BadRequestException('latestVersion must be >= minSupportedVersion');
    }
    return this.prisma.appVersion.update({
      where: { id },
      data: {
        ...dto,
        publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : undefined,
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.appVersion.findFirst({ where: { id } });
    if (!existing) throw new NotFoundException(`AppVersion ${id} not found`);
    await this.prisma.appVersion.delete({ where: { id } });
    return { ok: true };
  }
}

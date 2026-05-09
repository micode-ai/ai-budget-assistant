# App Update Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify mobile users at app launch when a newer version is available in Google Play / App Store, with a dismissible modal that links to the store and an optional non-dismissible "must update" path for releases below an admin-configured minimum.

**Architecture:** Admin manually publishes a per-platform "latest version" row via the admin web panel (NestJS endpoint behind the existing `AdminGuard`). Mobile checks a public REST endpoint on launch / foreground transition, compares against `Application.nativeApplicationVersion`, and conditionally renders an `<UpdatePrompt />` modal mounted at the root layout.

**Tech Stack:** NestJS 10 / Prisma 5 / Postgres (`apps/api`); Next.js 16 / React Query 5 / shadcn/ui (`apps/admin`); Expo 54 / React Native 0.81 / `expo-application` (`apps/mobile`); shared types in `packages/shared-types`.

**Spec:** `docs/superpowers/specs/2026-05-08-app-update-prompt-design.md`

**Spec deviation note:** The spec mentions `ZodValidationPipe` and `AsyncStorage`. The codebase uses **class-validator** (apps/api) and the project's own `secureStorage` wrapper (apps/mobile) — this plan follows the codebase conventions, not the spec wording. No design intent is changed.

---

## File Structure

| File | Purpose |
|---|---|
| `packages/shared-types/src/entities/index.ts` | Append `AppPlatform` and `AppVersion` |
| `packages/shared-types/src/dto/index.ts` | Append `AppVersionCheckResponse`, `CreateAppVersionDto`, `UpdateAppVersionDto` |
| `apps/api/prisma/schema.prisma` | Add `AppPlatform` enum and `AppVersion` model |
| `apps/api/src/modules/app-versions/app-versions.module.ts` | Module wiring |
| `apps/api/src/modules/app-versions/app-versions.controller.ts` | Public `GET /app-versions/check` |
| `apps/api/src/modules/app-versions/app-versions.admin.controller.ts` | Admin CRUD under `/admin/app-versions` |
| `apps/api/src/modules/app-versions/app-versions.service.ts` | Business logic |
| `apps/api/src/modules/app-versions/dto/index.ts` | class-validator DTOs |
| `apps/api/src/modules/app-versions/utils/semver.ts` | Numeric semver compare util |
| `apps/api/src/modules/app-versions/utils/semver.spec.ts` | Unit tests for semver util |
| `apps/api/src/modules/app-versions/app-versions.service.spec.ts` | Unit tests for service |
| `apps/api/src/app.module.ts` | Register `AppVersionsModule` |
| `apps/admin/src/components/layout/app-sidebar.tsx` | Add "App Versions" nav entry |
| `apps/admin/src/app/app-versions/page.tsx` | Admin list + form page |
| `apps/admin/src/hooks/use-app-versions.ts` | React Query hooks |
| `apps/mobile/package.json` | Add `expo-application` |
| `apps/mobile/src/services/appVersion.ts` | HTTP wrapper around `/app-versions/check` |
| `apps/mobile/src/hooks/useAppVersionCheck.ts` | Foreground-triggered check |
| `apps/mobile/src/components/UpdatePrompt.tsx` | Modal component |
| `apps/mobile/src/components/__tests__/UpdatePrompt.test.tsx` | Unit tests |
| `apps/mobile/src/i18n/locales/{en,de,es,fr,pl,ru,ua,be}.ts` | New `update.*` strings |
| `apps/mobile/app/_layout.tsx` | Mount `<UpdatePrompt />` at root |

---

## Task 1 — Shared types

**Files:**
- Modify: `packages/shared-types/src/entities/index.ts`
- Modify: `packages/shared-types/src/dto/index.ts`

- [ ] **Step 1.1: Append entity types**

In `packages/shared-types/src/entities/index.ts`, append at end of file:

```ts
// App version (Google Play / App Store update tracking)
export type AppPlatform = 'ios' | 'android';

export interface AppVersion {
  id: string;
  platform: AppPlatform;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes: Record<string, string> | null;
  storeUrl: string;
  publishedAt: string;
  updatedAt: string;
}
```

- [ ] **Step 1.2: Append DTOs**

In `packages/shared-types/src/dto/index.ts`, append at end of file:

```ts
// App version DTOs
import type { AppPlatform } from '../entities';

export interface AppVersionCheckResponse {
  latestVersion: string;
  minSupportedVersion: string;
  isUpdateAvailable: boolean;
  isUpdateRequired: boolean;
  releaseNotes: Record<string, string> | null;
  storeUrl: string;
}

export interface CreateAppVersionDto {
  platform: AppPlatform;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes?: Record<string, string>;
  storeUrl: string;
  publishedAt?: string;
}

export type UpdateAppVersionDto = Partial<CreateAppVersionDto>;
```

> If the file already imports from `'../entities'` at the top, hoist `AppPlatform` into that existing import block instead of adding a second one.

- [ ] **Step 1.3: Type-check**

Run from project root: `npm run typecheck`
Expected: passes (no errors).

- [ ] **Step 1.4: Commit**

```bash
git add packages/shared-types/src/
git commit -m "feat(shared-types): add AppVersion entity and DTOs"
```

---

## Task 2 — Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_add_app_versions/migration.sql` (generated)

- [ ] **Step 2.1: Add enum + model to schema**

Append to `apps/api/prisma/schema.prisma` (after the existing enums section):

```prisma
enum AppPlatform {
  ios
  android

  @@map("app_platform")
}

model AppVersion {
  id                  String      @id @default(cuid())
  platform            AppPlatform
  latestVersion       String      @map("latest_version")
  minSupportedVersion String      @map("min_supported_version")
  releaseNotes        Json?       @map("release_notes")
  storeUrl            String      @map("store_url")
  publishedAt         DateTime    @default(now()) @map("published_at")
  updatedAt           DateTime    @updatedAt @map("updated_at")

  @@index([platform, publishedAt(sort: Desc)])
  @@map("app_versions")
}
```

- [ ] **Step 2.2: Create migration**

From `apps/api/`:
```
npx prisma migrate dev --name add_app_versions
```
Expected: migration file created under `prisma/migrations/`, Prisma client regenerated, no errors.

- [ ] **Step 2.3: Type-check the API**

From project root: `npm run typecheck -- --filter=@budget/api`
(or from `apps/api/`: `npm run typecheck`)
Expected: passes (the new `AppVersion` model is now available on `prisma.appVersion`).

- [ ] **Step 2.4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(api): add AppVersion model and migration"
```

---

## Task 3 — Semver compare util (TDD)

**Files:**
- Create: `apps/api/src/modules/app-versions/utils/semver.ts`
- Create: `apps/api/src/modules/app-versions/utils/semver.spec.ts`

- [ ] **Step 3.1: Write failing tests first**

Create `apps/api/src/modules/app-versions/utils/semver.spec.ts`:

```ts
import { compareSemver, isSemver } from './semver';

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns negative when a < b', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0);
    expect(compareSemver('1.0.0', '1.1.0')).toBeLessThan(0);
    expect(compareSemver('1.9.0', '1.10.0')).toBeLessThan(0); // numeric, not lexical
    expect(compareSemver('0.9.9', '1.0.0')).toBeLessThan(0);
  });

  it('returns positive when a > b', () => {
    expect(compareSemver('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('throws on malformed input', () => {
    expect(() => compareSemver('1.0', '1.0.0')).toThrow();
    expect(() => compareSemver('foo', '1.0.0')).toThrow();
    expect(() => compareSemver('1.0.0-beta', '1.0.0')).toThrow();
  });
});

describe('isSemver', () => {
  it('returns true for valid x.y.z strings', () => {
    expect(isSemver('1.0.0')).toBe(true);
    expect(isSemver('10.20.30')).toBe(true);
  });

  it('returns false otherwise', () => {
    expect(isSemver('1.0')).toBe(false);
    expect(isSemver('1.0.0-beta')).toBe(false);
    expect(isSemver('v1.0.0')).toBe(false);
    expect(isSemver('')).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run tests — verify they fail**

From `apps/api/`:
```
npx jest src/modules/app-versions/utils/semver.spec.ts
```
Expected: FAIL with module-not-found / undefined-export errors.

- [ ] **Step 3.3: Implement util**

Create `apps/api/src/modules/app-versions/utils/semver.ts`:

```ts
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function isSemver(version: string): boolean {
  return SEMVER_RE.test(version);
}

export function compareSemver(a: string, b: string): number {
  const ma = SEMVER_RE.exec(a);
  const mb = SEMVER_RE.exec(b);
  if (!ma || !mb) {
    throw new Error(`Invalid semver: ${!ma ? a : b}`);
  }
  for (let i = 1; i <= 3; i++) {
    const diff = Number(ma[i]) - Number(mb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}
```

- [ ] **Step 3.4: Run tests — verify they pass**

```
npx jest src/modules/app-versions/utils/semver.spec.ts
```
Expected: PASS, all 3 describe blocks green.

- [ ] **Step 3.5: Commit**

```bash
git add apps/api/src/modules/app-versions/utils/
git commit -m "feat(api): add numeric semver compare utility"
```

---

## Task 4 — API DTOs

**Files:**
- Create: `apps/api/src/modules/app-versions/dto/index.ts`

- [ ] **Step 4.1: Write DTOs with class-validator**

Create `apps/api/src/modules/app-versions/dto/index.ts`:

```ts
import { IsString, IsEnum, IsOptional, IsObject, Matches, IsDateString, IsUrl, ValidateIf } from 'class-validator';

export const APP_PLATFORMS = ['ios', 'android'] as const;
export type AppPlatformValue = typeof APP_PLATFORMS[number];

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

export class CreateAppVersionDto {
  @IsEnum(APP_PLATFORMS)
  platform!: AppPlatformValue;

  @IsString()
  @Matches(SEMVER_REGEX, { message: 'latestVersion must be x.y.z' })
  latestVersion!: string;

  @IsString()
  @Matches(SEMVER_REGEX, { message: 'minSupportedVersion must be x.y.z' })
  minSupportedVersion!: string;

  @IsOptional()
  @IsObject()
  releaseNotes?: Record<string, string>;

  @IsString()
  @IsUrl({ require_tld: false })
  storeUrl!: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class UpdateAppVersionDto {
  @IsOptional()
  @IsEnum(APP_PLATFORMS)
  platform?: AppPlatformValue;

  @IsOptional()
  @IsString()
  @Matches(SEMVER_REGEX, { message: 'latestVersion must be x.y.z' })
  latestVersion?: string;

  @IsOptional()
  @IsString()
  @Matches(SEMVER_REGEX, { message: 'minSupportedVersion must be x.y.z' })
  minSupportedVersion?: string;

  @IsOptional()
  @IsObject()
  releaseNotes?: Record<string, string>;

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  storeUrl?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class CheckAppVersionQueryDto {
  @IsEnum(APP_PLATFORMS)
  platform!: AppPlatformValue;

  @IsString()
  @Matches(SEMVER_REGEX, { message: 'version must be x.y.z' })
  version!: string;
}
```

> The cross-field rule "latestVersion >= minSupportedVersion" lives in the service (it depends on the semver util) — see Task 5.

- [ ] **Step 4.2: Type-check API**

From `apps/api/`: `npm run typecheck`
Expected: passes.

- [ ] **Step 4.3: Commit**

```bash
git add apps/api/src/modules/app-versions/dto/
git commit -m "feat(api): add app-versions DTOs"
```

---

## Task 5 — API service + unit tests (TDD on cross-field rule)

**Files:**
- Create: `apps/api/src/modules/app-versions/app-versions.service.ts`
- Create: `apps/api/src/modules/app-versions/app-versions.service.spec.ts`

- [ ] **Step 5.1: Write failing service tests**

Create `apps/api/src/modules/app-versions/app-versions.service.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppVersionsService } from './app-versions.service';

function makePrismaMock() {
  return {
    appVersion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('AppVersionsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AppVersionsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AppVersionsService(prisma as any);
  });

  describe('check', () => {
    it('returns up-to-date when no row exists for the platform', async () => {
      prisma.appVersion.findFirst.mockResolvedValue(null);
      const r = await service.check('android', '1.0.0');
      expect(r.isUpdateAvailable).toBe(false);
      expect(r.isUpdateRequired).toBe(false);
      expect(r.latestVersion).toBe('1.0.0');
      expect(r.releaseNotes).toBeNull();
      expect(r.storeUrl).toMatch(/play\.google\.com/);
    });

    it('flags update available when client version < latest', async () => {
      prisma.appVersion.findFirst.mockResolvedValue({
        latestVersion: '1.2.0',
        minSupportedVersion: '1.0.0',
        releaseNotes: { en: 'Bug fixes' },
        storeUrl: 'https://example.com',
      });
      const r = await service.check('android', '1.1.0');
      expect(r.isUpdateAvailable).toBe(true);
      expect(r.isUpdateRequired).toBe(false);
    });

    it('flags update required when client version < min', async () => {
      prisma.appVersion.findFirst.mockResolvedValue({
        latestVersion: '2.0.0',
        minSupportedVersion: '1.5.0',
        releaseNotes: null,
        storeUrl: 'https://example.com',
      });
      const r = await service.check('android', '1.0.0');
      expect(r.isUpdateAvailable).toBe(true);
      expect(r.isUpdateRequired).toBe(true);
    });

    it('returns up-to-date when client version equals latest', async () => {
      prisma.appVersion.findFirst.mockResolvedValue({
        latestVersion: '1.0.0',
        minSupportedVersion: '1.0.0',
        releaseNotes: null,
        storeUrl: 'https://example.com',
      });
      const r = await service.check('android', '1.0.0');
      expect(r.isUpdateAvailable).toBe(false);
      expect(r.isUpdateRequired).toBe(false);
    });
  });

  describe('create', () => {
    it('rejects when latestVersion < minSupportedVersion', async () => {
      await expect(
        service.create({
          platform: 'android',
          latestVersion: '1.0.0',
          minSupportedVersion: '1.5.0',
          storeUrl: 'https://example.com',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.appVersion.create).not.toHaveBeenCalled();
    });

    it('persists when latest >= min', async () => {
      prisma.appVersion.create.mockResolvedValue({ id: 'cuid1' });
      await service.create({
        platform: 'android',
        latestVersion: '1.2.0',
        minSupportedVersion: '1.0.0',
        storeUrl: 'https://example.com',
      });
      expect(prisma.appVersion.create).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFound when row does not exist', async () => {
      prisma.appVersion.findFirst.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 5.2: Run tests — verify they fail**

```
npx jest src/modules/app-versions/app-versions.service.spec.ts
```
Expected: FAIL with module-not-found.

- [ ] **Step 5.3: Implement service**

Create `apps/api/src/modules/app-versions/app-versions.service.ts`:

```ts
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
```

- [ ] **Step 5.4: Run tests — verify they pass**

```
npx jest src/modules/app-versions/app-versions.service.spec.ts
```
Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add apps/api/src/modules/app-versions/app-versions.service.ts apps/api/src/modules/app-versions/app-versions.service.spec.ts
git commit -m "feat(api): app-versions service with check/create/update/remove"
```

---

## Task 6 — API controllers (public + admin)

**Files:**
- Create: `apps/api/src/modules/app-versions/app-versions.controller.ts`
- Create: `apps/api/src/modules/app-versions/app-versions.admin.controller.ts`

- [ ] **Step 6.1: Public controller**

Create `apps/api/src/modules/app-versions/app-versions.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { AppVersionsService } from './app-versions.service';
import { CheckAppVersionQueryDto } from './dto';

@Controller('app-versions')
export class AppVersionsController {
  constructor(private readonly service: AppVersionsService) {}

  @Get('check')
  async check(@Query() q: CheckAppVersionQueryDto) {
    return this.service.check(q.platform, q.version);
  }
}
```

> No auth guards — endpoint is intentionally public so the mobile app can call before login. Global throttler (already configured in `app.module.ts`) applies.

- [ ] **Step 6.2: Admin controller**

Create `apps/api/src/modules/app-versions/app-versions.admin.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { AppVersionsService } from './app-versions.service';
import { CreateAppVersionDto, UpdateAppVersionDto } from './dto';

@Controller('admin/app-versions')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AppVersionsAdminController {
  constructor(private readonly service: AppVersionsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateAppVersionDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppVersionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
```

- [ ] **Step 6.3: Type-check**

From `apps/api/`: `npm run typecheck`
Expected: passes.

- [ ] **Step 6.4: Commit**

```bash
git add apps/api/src/modules/app-versions/app-versions.controller.ts apps/api/src/modules/app-versions/app-versions.admin.controller.ts
git commit -m "feat(api): app-versions public + admin controllers"
```

---

## Task 7 — Module wiring

**Files:**
- Create: `apps/api/src/modules/app-versions/app-versions.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 7.1: Create module**

Create `apps/api/src/modules/app-versions/app-versions.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppVersionsService } from './app-versions.service';
import { AppVersionsController } from './app-versions.controller';
import { AppVersionsAdminController } from './app-versions.admin.controller';
import { AdminGuard } from '../admin/admin.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AppVersionsController, AppVersionsAdminController],
  providers: [AppVersionsService, AdminGuard],
  exports: [AppVersionsService],
})
export class AppVersionsModule {}
```

> `JwtModule.register({})` is required so `JwtAuthGuard` resolves inside this module — same pattern as `admin.module.ts`. `DatabaseModule` is `@Global()` and does not need to be imported (existing modules like `admin.module.ts` don't import it either).

- [ ] **Step 7.2: Register in `app.module.ts`**

In `apps/api/src/app.module.ts`:
- Add import: `import { AppVersionsModule } from './modules/app-versions/app-versions.module';`
- Add `AppVersionsModule` to the `imports` array (anywhere alphabetical works — keep it next to other feature modules).

- [ ] **Step 7.3: Build the API to confirm wiring**

From `apps/api/`: `npm run build`
Expected: builds cleanly.

- [ ] **Step 7.4: Smoke run + curl**

From `apps/api/`: `npm run dev` (in a background terminal), then in another terminal:

```
curl "http://localhost:3000/api/v1/app-versions/check?platform=android&version=1.0.0"
```
Expected: `{ "latestVersion":"1.0.0", "isUpdateAvailable":false, ... }` (no row yet → up-to-date).

```
curl "http://localhost:3000/api/v1/app-versions/check?platform=foo&version=1.0.0"
```
Expected: 400 (validation rejects bad platform).

Stop the dev server.

- [ ] **Step 7.5: Commit**

```bash
git add apps/api/src/modules/app-versions/app-versions.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire AppVersionsModule into app"
```

---

## Task 8 — Admin: React Query hooks

**Files:**
- Create: `apps/admin/src/hooks/use-app-versions.ts`

- [ ] **Step 8.1: Hooks**

Create `apps/admin/src/hooks/use-app-versions.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppVersion, CreateAppVersionDto, UpdateAppVersionDto } from "@budget/shared-types";

const KEY = ["admin", "app-versions"] as const;

export function useAppVersions() {
  return useQuery<AppVersion[]>({
    queryKey: KEY,
    queryFn: () => api.get("admin/app-versions").json(),
  });
}

export function useCreateAppVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAppVersionDto) => api.post("admin/app-versions", { json: dto }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAppVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAppVersionDto }) =>
      api.patch(`admin/app-versions/${id}`, { json: dto }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAppVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`admin/app-versions/${id}`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
```

- [ ] **Step 8.2: Type-check**

From `apps/admin/`: `npm run typecheck`
Expected: passes.

- [ ] **Step 8.3: Commit**

```bash
git add apps/admin/src/hooks/use-app-versions.ts
git commit -m "feat(admin): React Query hooks for app-versions"
```

---

## Task 9 — Admin: sidebar nav entry

**Files:**
- Modify: `apps/admin/src/components/layout/app-sidebar.tsx`

- [ ] **Step 9.1: Add nav item**

In `apps/admin/src/components/layout/app-sidebar.tsx`:
- Add `Smartphone` to the `lucide-react` import.
- Add to the `navItems` array (place between `Communications` and `Referrals` to keep grouping coherent):

```ts
  { href: "/app-versions", label: "App Versions", icon: Smartphone },
```

- [ ] **Step 9.2: Type-check**

From `apps/admin/`: `npm run typecheck`
Expected: passes.

- [ ] **Step 9.3: Commit**

```bash
git add apps/admin/src/components/layout/app-sidebar.tsx
git commit -m "feat(admin): add App Versions sidebar entry"
```

---

## Task 10 — Admin: page

**Files:**
- Create: `apps/admin/src/app/app-versions/page.tsx`

- [ ] **Step 10.1: Page component**

Create `apps/admin/src/app/app-versions/page.tsx`. Use the existing shadcn primitives at `@/components/ui/*`. The page should render:

- Two tabs (`Android`, `iOS`) using `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`.
- Inside each tab: a `Card` listing past releases (most recent first, "Current" badge on the first row), and a "New release" `Button` that opens a `Dialog`.
- The Dialog form fields: `latestVersion`, `minSupportedVersion`, `storeUrl` (`Input`), 8 release-notes `Textarea`s (one per locale, `en` required), and a Save button. On submit, call `useCreateAppVersion`. Show a `toast.error` on rejected response, `toast.success` on ok.
- A trash button per row → confirms via shadcn `AlertDialog`, calls `useDeleteAppVersion`.

Reference for styling and primitives: `apps/admin/src/app/communications/page.tsx`. Reuse the same structural conventions (`"use client";`, `useState` for form state, `toast` from `sonner`, helper `formatDateTime` from `@/lib/utils`).

Skeleton:

```tsx
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import {
  useAppVersions,
  useCreateAppVersion,
  useDeleteAppVersion,
} from "@/hooks/use-app-versions";
import type { AppPlatform, AppVersion } from "@budget/shared-types";

const LOCALES = ["en", "de", "es", "fr", "pl", "ru", "ua", "be"] as const;
const DEFAULT_STORE_URL: Record<AppPlatform, string> = {
  android: "https://play.google.com/store/apps/details?id=com.budget.assistant",
  ios: "https://apps.apple.com/app/id000000000",
};

export default function AppVersionsPage() {
  // implement: tabs, list per platform, dialog form, delete confirm
  // ...
}
```

Implement the body. Keep it under ~250 lines; if it grows past that, extract a `<NewReleaseDialog />` sub-component into the same file (don't create a separate file unless reused).

- [ ] **Step 10.2: Visual smoke test**

From `apps/admin/`: `npm run dev` (port 3001).

In a browser at `http://localhost:3001/app-versions` (after logging in as an admin):
- Sidebar shows the "App Versions" entry.
- Both tabs render with empty list.
- Click "New release", fill in `latestVersion=1.0.0`, `minSupportedVersion=1.0.0`, `storeUrl=https://play.google.com/...`, English notes "First release", submit. Row appears with "Current" badge.
- Try `latestVersion=0.9.0`, `minSupportedVersion=1.0.0` → API responds 400, toast shows the error.
- Click trash → confirm → row disappears.

Stop the dev server.

- [ ] **Step 10.3: Commit**

```bash
git add apps/admin/src/app/app-versions/
git commit -m "feat(admin): app-versions management page"
```

---

## Task 11 — Mobile: install `expo-application`

**Files:**
- Modify: `apps/mobile/package.json` (via expo install)
- Modify: `package-lock.json`

- [ ] **Step 11.1: Install with the Expo-pinned version**

From `apps/mobile/`:
```
npx expo install expo-application
```
Expected: adds `expo-application` to `dependencies` at the version Expo SDK 54 prefers. Lockfile updates.

- [ ] **Step 11.2: Type-check**

From `apps/mobile/`: `npm run typecheck`
Expected: passes.

- [ ] **Step 11.3: Commit**

```bash
git add apps/mobile/package.json package-lock.json
git commit -m "chore(mobile): add expo-application dependency"
```

---

## Task 12 — Mobile: appVersion service

**Files:**
- Create: `apps/mobile/src/services/appVersion.ts`

- [ ] **Step 12.1: Service**

Create `apps/mobile/src/services/appVersion.ts`:

```ts
import type { AppVersionCheckResponse, AppPlatform } from '@budget/shared-types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export async function fetchVersionCheck(
  platform: AppPlatform,
  version: string,
  signal?: AbortSignal,
): Promise<AppVersionCheckResponse> {
  const url = `${API_BASE_URL}/app-versions/check?platform=${platform}&version=${encodeURIComponent(version)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Version check failed: ${res.status}`);
  }
  return res.json();
}
```

> Uses raw `fetch`, not the auth-aware `api` client, because the endpoint is public and the mobile may call before login. Same pattern would be used for any pre-auth health/ping call.

- [ ] **Step 12.2: Type-check**

From `apps/mobile/`: `npm run typecheck`
Expected: passes.

- [ ] **Step 12.3: Commit**

```bash
git add apps/mobile/src/services/appVersion.ts
git commit -m "feat(mobile): appVersion service"
```

---

## Task 13 — Mobile: useAppVersionCheck hook

**Files:**
- Create: `apps/mobile/src/hooks/useAppVersionCheck.ts`

- [ ] **Step 13.1: Hook**

Create `apps/mobile/src/hooks/useAppVersionCheck.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Application from 'expo-application';
import debug from 'debug';
import type { AppVersionCheckResponse } from '@budget/shared-types';
import { fetchVersionCheck } from '@/services/appVersion';

const log = debug('app:version-check');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

type Status = 'available' | 'required' | 'up-to-date' | 'unknown';

interface State {
  status: Status;
  check: AppVersionCheckResponse | null;
}

let cached: { fetchedAt: number; state: State } | null = null;

export function useAppVersionCheck(): State {
  const [state, setState] = useState<State>(() => cached?.state ?? { status: 'unknown', check: null });
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    async function run() {
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        setState(cached.state);
        return;
      }

      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;

      try {
        const platform = Platform.OS === 'ios' ? 'ios' : 'android';
        const version = Application.nativeApplicationVersion ?? '0.0.0';
        const check = await fetchVersionCheck(platform, version, ctrl.signal);
        const status: Status = check.isUpdateRequired
          ? 'required'
          : check.isUpdateAvailable
            ? 'available'
            : 'up-to-date';
        const next: State = { status, check };
        cached = { fetchedAt: Date.now(), state: next };
        setState(next);
      } catch (err) {
        log('check failed: %o', err);
        // leave existing state; do not flip to error
      }
    }

    run();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') run();
    });
    return () => {
      sub.remove();
      inFlight.current?.abort();
    };
  }, []);

  return state;
}

// Test seam — clears the in-memory cache.
export function __resetAppVersionCheckCache() {
  cached = null;
}
```

- [ ] **Step 13.2: Type-check**

From `apps/mobile/`: `npm run typecheck`
Expected: passes.

- [ ] **Step 13.3: Commit**

```bash
git add apps/mobile/src/hooks/useAppVersionCheck.ts
git commit -m "feat(mobile): useAppVersionCheck hook"
```

---

## Task 14 — Mobile: i18n keys (8 locales)

**Files:**
- Modify: `apps/mobile/src/i18n/locales/en.ts`
- Modify: `apps/mobile/src/i18n/locales/de.ts`
- Modify: `apps/mobile/src/i18n/locales/es.ts`
- Modify: `apps/mobile/src/i18n/locales/fr.ts`
- Modify: `apps/mobile/src/i18n/locales/pl.ts`
- Modify: `apps/mobile/src/i18n/locales/ru.ts`
- Modify: `apps/mobile/src/i18n/locales/ua.ts`
- Modify: `apps/mobile/src/i18n/locales/be.ts`

- [ ] **Step 14.1: Add `update` namespace to all 8 files**

Each file is a TypeScript module that default-exports an object. Add a top-level `update` key to each one. Use the strings below.

**en.ts:**
```ts
update: {
  titleAvailable: 'Update available',
  titleRequired: 'Update required',
  bodyAvailable: 'A new version of AI Budget Assistant is available.',
  bodyRequired: 'This version is no longer supported. Please update to continue.',
  actionUpdate: 'Update',
  actionLater: 'Later',
  releaseNotesLabel: "What's new",
},
```

**de.ts:**
```ts
update: {
  titleAvailable: 'Update verfügbar',
  titleRequired: 'Update erforderlich',
  bodyAvailable: 'Eine neue Version von AI Budget Assistant ist verfügbar.',
  bodyRequired: 'Diese Version wird nicht mehr unterstützt. Bitte aktualisiere, um fortzufahren.',
  actionUpdate: 'Aktualisieren',
  actionLater: 'Später',
  releaseNotesLabel: 'Was ist neu',
},
```

**es.ts:**
```ts
update: {
  titleAvailable: 'Actualización disponible',
  titleRequired: 'Actualización requerida',
  bodyAvailable: 'Hay una nueva versión de AI Budget Assistant disponible.',
  bodyRequired: 'Esta versión ya no es compatible. Actualiza para continuar.',
  actionUpdate: 'Actualizar',
  actionLater: 'Más tarde',
  releaseNotesLabel: 'Novedades',
},
```

**fr.ts:**
```ts
update: {
  titleAvailable: 'Mise à jour disponible',
  titleRequired: 'Mise à jour requise',
  bodyAvailable: "Une nouvelle version d'AI Budget Assistant est disponible.",
  bodyRequired: "Cette version n'est plus prise en charge. Veuillez mettre à jour pour continuer.",
  actionUpdate: 'Mettre à jour',
  actionLater: 'Plus tard',
  releaseNotesLabel: 'Nouveautés',
},
```

**pl.ts:**
```ts
update: {
  titleAvailable: 'Dostępna aktualizacja',
  titleRequired: 'Wymagana aktualizacja',
  bodyAvailable: 'Nowa wersja AI Budget Assistant jest dostępna.',
  bodyRequired: 'Ta wersja nie jest już wspierana. Zaktualizuj, aby kontynuować.',
  actionUpdate: 'Aktualizuj',
  actionLater: 'Później',
  releaseNotesLabel: 'Co nowego',
},
```

**ru.ts:**
```ts
update: {
  titleAvailable: 'Доступно обновление',
  titleRequired: 'Требуется обновление',
  bodyAvailable: 'Доступна новая версия AI Budget Assistant.',
  bodyRequired: 'Эта версия больше не поддерживается. Обновите приложение, чтобы продолжить.',
  actionUpdate: 'Обновить',
  actionLater: 'Позже',
  releaseNotesLabel: 'Что нового',
},
```

**ua.ts:**
```ts
update: {
  titleAvailable: 'Доступне оновлення',
  titleRequired: 'Потрібне оновлення',
  bodyAvailable: 'Доступна нова версія AI Budget Assistant.',
  bodyRequired: 'Ця версія більше не підтримується. Оновіть застосунок, щоб продовжити.',
  actionUpdate: 'Оновити',
  actionLater: 'Пізніше',
  releaseNotesLabel: 'Що нового',
},
```

**be.ts:**
```ts
update: {
  titleAvailable: 'Даступнае абнаўленне',
  titleRequired: 'Патрабуецца абнаўленне',
  bodyAvailable: 'Даступная новая версія AI Budget Assistant.',
  bodyRequired: 'Гэтая версія больш не падтрымліваецца. Абнавіце прыкладанне, каб працягнуць.',
  actionUpdate: 'Абнавіць',
  actionLater: 'Пазней',
  releaseNotesLabel: 'Што новага',
},
```

- [ ] **Step 14.2: Type-check**

From `apps/mobile/`: `npm run typecheck`
Expected: passes.

- [ ] **Step 14.3: Commit**

```bash
git add apps/mobile/src/i18n/locales/
git commit -m "feat(mobile): add update.* i18n keys for 8 locales"
```

---

## Task 15 — Mobile: UpdatePrompt component + tests

**Files:**
- Create: `apps/mobile/src/components/UpdatePrompt.tsx`
- Create: `apps/mobile/src/components/__tests__/UpdatePrompt.test.tsx`

- [ ] **Step 15.1: Write failing tests**

Create `apps/mobile/src/components/__tests__/UpdatePrompt.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { UpdatePrompt } from '../UpdatePrompt';
import { secureStorage } from '@/services/secureStorage';

jest.mock('@/hooks/useAppVersionCheck', () => ({
  useAppVersionCheck: jest.fn(),
}));
jest.mock('@/services/secureStorage', () => ({
  secureStorage: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: 'en' },
  }),
}));

import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';
const useAppVersionCheckMock = useAppVersionCheck as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (secureStorage.getItem as jest.Mock).mockResolvedValue(null);
});

describe('UpdatePrompt', () => {
  it('renders nothing when status is up-to-date', () => {
    useAppVersionCheckMock.mockReturnValue({ status: 'up-to-date', check: null });
    const { queryByText } = render(<UpdatePrompt />);
    expect(queryByText('update.titleAvailable')).toBeNull();
  });

  it('renders nothing when status is unknown', () => {
    useAppVersionCheckMock.mockReturnValue({ status: 'unknown', check: null });
    const { queryByText } = render(<UpdatePrompt />);
    expect(queryByText('update.titleAvailable')).toBeNull();
  });

  it('renders available modal when update is available', async () => {
    useAppVersionCheckMock.mockReturnValue({
      status: 'available',
      check: {
        latestVersion: '1.2.0',
        minSupportedVersion: '1.0.0',
        isUpdateAvailable: true,
        isUpdateRequired: false,
        releaseNotes: { en: 'Bug fixes' },
        storeUrl: 'https://play.google.com/x',
      },
    });
    const { findByText } = render(<UpdatePrompt />);
    expect(await findByText('update.titleAvailable')).toBeTruthy();
    expect(await findByText('Bug fixes')).toBeTruthy();
    expect(await findByText('update.actionLater')).toBeTruthy();
  });

  it('hides modal when latestVersion was already skipped', async () => {
    (secureStorage.getItem as jest.Mock).mockResolvedValue('1.2.0');
    useAppVersionCheckMock.mockReturnValue({
      status: 'available',
      check: {
        latestVersion: '1.2.0',
        minSupportedVersion: '1.0.0',
        isUpdateAvailable: true,
        isUpdateRequired: false,
        releaseNotes: null,
        storeUrl: 'https://play.google.com/x',
      },
    });
    const { queryByText } = render(<UpdatePrompt />);
    await waitFor(() => expect(queryByText('update.actionLater')).toBeNull());
  });

  it('shows force-update modal even when skipped', async () => {
    (secureStorage.getItem as jest.Mock).mockResolvedValue('1.2.0');
    useAppVersionCheckMock.mockReturnValue({
      status: 'required',
      check: {
        latestVersion: '1.2.0',
        minSupportedVersion: '1.2.0',
        isUpdateAvailable: true,
        isUpdateRequired: true,
        releaseNotes: null,
        storeUrl: 'https://play.google.com/x',
      },
    });
    const { findByText, queryByText } = render(<UpdatePrompt />);
    expect(await findByText('update.titleRequired')).toBeTruthy();
    expect(queryByText('update.actionLater')).toBeNull();
  });

  it('opens store URL when Update tapped', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    useAppVersionCheckMock.mockReturnValue({
      status: 'available',
      check: {
        latestVersion: '1.2.0',
        minSupportedVersion: '1.0.0',
        isUpdateAvailable: true,
        isUpdateRequired: false,
        releaseNotes: null,
        storeUrl: 'https://play.google.com/x',
      },
    });
    const { findByText } = render(<UpdatePrompt />);
    fireEvent.press(await findByText('update.actionUpdate'));
    expect(openURL).toHaveBeenCalledWith('https://play.google.com/x');
  });

  it('persists skipped version when Later tapped', async () => {
    useAppVersionCheckMock.mockReturnValue({
      status: 'available',
      check: {
        latestVersion: '1.2.0',
        minSupportedVersion: '1.0.0',
        isUpdateAvailable: true,
        isUpdateRequired: false,
        releaseNotes: null,
        storeUrl: 'https://play.google.com/x',
      },
    });
    const { findByText, queryByText } = render(<UpdatePrompt />);
    fireEvent.press(await findByText('update.actionLater'));
    await waitFor(() => expect(secureStorage.setItem).toHaveBeenCalledWith('skippedUpdateVersion', '1.2.0'));
    await waitFor(() => expect(queryByText('update.titleAvailable')).toBeNull());
  });
});
```

- [ ] **Step 15.2: Run tests — verify they fail**

```
npx jest src/components/__tests__/UpdatePrompt.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 15.3: Implement component**

Create `apps/mobile/src/components/UpdatePrompt.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ScrollView, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';
import { secureStorage } from '@/services/secureStorage';

const SKIPPED_KEY = 'skippedUpdateVersion';

export function UpdatePrompt() {
  const { t, i18n } = useTranslation();
  const { theme } = useTheme();
  const { status, check } = useAppVersionCheck();
  const [skippedVersion, setSkippedVersion] = useState<string | null>(null);
  const [skippedLoaded, setSkippedLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    secureStorage
      .getItem(SKIPPED_KEY)
      .then((v) => {
        if (!cancelled) {
          setSkippedVersion(v);
          setSkippedLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setSkippedLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!skippedLoaded || !check) return null;
  if (status === 'up-to-date' || status === 'unknown') return null;

  const isRequired = status === 'required';
  if (!isRequired && skippedVersion === check.latestVersion) return null;

  const notes = pickReleaseNotes(check.releaseNotes, i18n.language);

  async function onUpdate() {
    try {
      await Linking.openURL(check!.storeUrl);
    } catch {
      // best-effort; modal stays open
    }
  }

  async function onLater() {
    try {
      await secureStorage.setItem(SKIPPED_KEY, check!.latestVersion);
    } finally {
      setSkippedVersion(check!.latestVersion);
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={isRequired ? () => {} : onLater}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>
            {t(isRequired ? 'update.titleRequired' : 'update.titleAvailable')}
          </Text>
          <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
            {t(isRequired ? 'update.bodyRequired' : 'update.bodyAvailable')}
          </Text>
          {notes ? (
            <View style={styles.notes}>
              <Text style={[styles.notesLabel, { color: theme.colors.text }]}>
                {t('update.releaseNotesLabel')}
              </Text>
              <ScrollView style={styles.notesScroll}>
                <Text style={{ color: theme.colors.textSecondary }}>{notes}</Text>
              </ScrollView>
            </View>
          ) : null}
          <View style={styles.actions}>
            {!isRequired && (
              <Pressable onPress={onLater} style={styles.secondary}>
                <Text style={{ color: theme.colors.textSecondary }}>{t('update.actionLater')}</Text>
              </Pressable>
            )}
            <Pressable onPress={onUpdate} style={[styles.primary, { backgroundColor: theme.colors.primary }]}>
              <Text style={styles.primaryText}>{t('update.actionUpdate')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function pickReleaseNotes(notes: Record<string, string> | null, locale: string): string | null {
  if (!notes) return null;
  const short = locale.split('-')[0];
  return notes[locale] ?? notes[short] ?? notes.en ?? null;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 16, padding: 20 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 15, marginBottom: 12 },
  notes: { marginBottom: 16 },
  notesLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  notesScroll: { maxHeight: 160 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  secondary: { paddingVertical: 10, paddingHorizontal: 16 },
  primary: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  primaryText: { color: 'white', fontWeight: '600' },
});
```

> If your `theme` shape differs from `colors.{surface,text,textSecondary,primary}`, swap to whatever the existing components use (grep `useTheme()` in `apps/mobile/src/components/` for examples).

- [ ] **Step 15.4: Run tests — verify they pass**

```
npx jest src/components/__tests__/UpdatePrompt.test.tsx
```
Expected: PASS for all 7 cases.

- [ ] **Step 15.5: Commit**

```bash
git add apps/mobile/src/components/UpdatePrompt.tsx apps/mobile/src/components/__tests__/UpdatePrompt.test.tsx
git commit -m "feat(mobile): UpdatePrompt modal with skip persistence"
```

---

## Task 16 — Mobile: mount in root layout

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 16.1: Mount the prompt**

In `apps/mobile/app/_layout.tsx`:
- Add import near other component imports: `import { UpdatePrompt } from '@/components/UpdatePrompt';`
- Inside the JSX returned around line 165 (`return ( <> ... )`), render `<UpdatePrompt />` immediately after `</Stack>` (line ~583) and before any closing fragment / status bar — so it overlays everything.

Diff sketch:
```tsx
      </Stack>
+     <UpdatePrompt />
      <StatusBar style="auto" />
```

(Match whatever the actual closing element is — the goal is "mounted at root, after the navigator".)

- [ ] **Step 16.2: Type-check**

From `apps/mobile/`: `npm run typecheck`
Expected: passes.

- [ ] **Step 16.3: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): mount UpdatePrompt in root layout"
```

---

## Task 17 — End-to-end manual smoke

This task is verification only — no code, no commit unless a regression is found.

- [ ] **Step 17.1: Launch the full stack**
  - `apps/api/`: `npm run dev`
  - `apps/admin/`: `npm run dev` (port 3001)
  - `apps/mobile/`: `npx expo start --web` (or build to a device)

- [ ] **Step 17.2: Admin → publish a release ahead of mobile**
  - Log into admin (port 3001).
  - Sidebar → "App Versions" → Android tab → "New release".
  - `latestVersion=1.2.0`, `minSupportedVersion=1.0.0`, `storeUrl=https://play.google.com/store/apps/details?id=com.budget.assistant`, EN notes "Bug fixes", RU notes "Исправления".
  - Submit → row appears, "Current" badge.

- [ ] **Step 17.3: Mobile shows soft prompt**
  - Mobile (build version remains `1.0.0`) opens.
  - "Update available" modal renders with the release notes in the device's locale.
  - Tap "Later" → modal closes; reload the app → modal does NOT re-appear.

- [ ] **Step 17.4: New release re-arms the prompt**
  - Admin publishes another row, `latestVersion=1.3.0`.
  - Reload mobile → modal re-appears (different `latestVersion`, skip key no longer matches).

- [ ] **Step 17.5: Force-update path**
  - Admin edits the latest row to `minSupportedVersion=1.3.0`.
  - Reload mobile → modal renders without "Later"; Android hardware back does not dismiss.
  - Tap "Update" → store URL opens in browser/external store handler.

- [ ] **Step 17.6: Failure modes**
  - Stop the API → reload mobile → no modal, no error toast, app boots normally.
  - Restart API. Admin deletes the latest row → reload mobile → no modal (no row for platform).

- [ ] **Step 17.7: Web build**
  - Open the mobile web preview → no API call to `/app-versions/check` (verify in network tab), no modal.

- [ ] **Step 17.8: Translations spot-check**
  - In the mobile app, switch language to Russian → re-trigger the prompt (publish a new row) → strings render in Russian.

If any step fails, fix the underlying code, add a regression test where applicable, and commit before continuing.

---

## Verification before marking the plan done

- [ ] All commits pushed to the working branch.
- [ ] `npm run typecheck` passes from project root.
- [ ] `npm run lint` passes from project root.
- [ ] `npm run test` passes from project root.
- [ ] Spec checklist (`docs/superpowers/specs/2026-05-08-app-update-prompt-design.md` "Manual test plan" section) walked through and ticked.

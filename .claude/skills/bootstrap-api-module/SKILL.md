---
name: bootstrap-api-module
description: Use when creating a NEW NestJS module under apps/api/src/modules/. Sets up the canonical structure (module/controller/service/dto), wires JwtAuthGuard + AccountContextGuard, enforces the (accountId, userId, dto) service signature, and registers the module with AppModule.
---

# Bootstrapping an API Module

The API has 29 modules under `apps/api/src/modules/<feature>/`. Every new module should follow the same shape so guards, account scoping, and DI wiring stay consistent.

## Canonical file layout

```
apps/api/src/modules/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts
├── <feature>.service.ts
└── dto/
    └── index.ts          # only if the module accepts input DTOs
```

Some modules add `guards/`, sub-services (e.g., `budget-alert.service.ts`), or `*.service.spec.ts`. Add those as needed — don't preemptively scaffold them.

## Required patterns

### Controller

- Class-decorated with `@Controller('<route>')` and `@UseGuards(JwtAuthGuard, AccountContextGuard)`.
- Inject the service via the constructor.
- Every handler accepts `@Req() req: AuthenticatedRequest` so `req.accountId` and `req.user.id` are available.
- For role-gated actions, add `@UseGuards(AccountRoleGuard)` and `@RequireRole('owner')` (or `'editor'`).

Example shape:

```ts
import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { FeatureService } from './feature.service';

@Controller('feature')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class FeatureController {
  constructor(private readonly service: FeatureService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: any) {
    return this.service.create(req.accountId, req.user.id, dto);
  }
}
```

### Service

- Method signature is `(accountId, userId, dto)` — accountId first, always.
- Every Prisma query filters by `accountId`. No exceptions.
- Inject `PrismaService` from `../../database/prisma.service`.

Example:

```ts
@Injectable()
export class FeatureService {
  constructor(private readonly prisma: PrismaService) {}

  async create(accountId: string, userId: string, dto: CreateFeatureDto) {
    return this.prisma.feature.create({
      data: { ...dto, accountId, createdById: userId },
    });
  }

  async findAll(accountId: string) {
    return this.prisma.feature.findMany({ where: { accountId } });
  }
}
```

### Module

```ts
@Module({
  imports: [/* other modules whose services we inject */],
  controllers: [FeatureController],
  providers: [FeatureService],
  exports: [FeatureService], // only if another module imports this one
})
export class FeatureModule {}
```

### DTOs (optional)

Define request DTOs in `dto/index.ts` using `class-validator`. The corresponding TypeScript types belong in `packages/shared-types/src/dto/index.ts` so the mobile app can import them.

## Wiring checklist

After creating the files:

1. Register the module in `apps/api/src/app.module.ts` `imports`.
2. If a new entity is involved: update `apps/api/prisma/schema.prisma`, then run:
   ```bash
   cd apps/api
   npx prisma migrate dev --name add_<feature>
   npx prisma generate
   ```
3. If the module exposes new types: add interfaces to `packages/shared-types/src/entities/index.ts` and DTOs to `packages/shared-types/src/dto/index.ts`.
4. If the mobile app should consume the endpoints: add methods to `apps/mobile/src/services/api.ts` and an optional store under `apps/mobile/src/stores/`.

## When NOT to use this skill

- For modules that should NOT be account-scoped (e.g., a public/admin endpoint). The `app-versions` module's public `GET /check` is the canonical exception — it bypasses both guards.
- For admin-only endpoints. Those use `JwtAuthGuard + AdminGuard` and live under `/admin/*` controllers.

## Common mistakes

- Putting account filtering in the controller instead of the service. Always filter in the service so background jobs and tests can call it directly.
- Reordering service args (e.g., `(userId, accountId, dto)`). The convention is `(accountId, userId, dto)` everywhere; reordering breaks call-site predictability.
- Forgetting to register the module in `app.module.ts` — endpoints will return 404 with no error.
- Adding new types only to the API and not to `packages/shared-types` — mobile will redefine them and they'll drift.

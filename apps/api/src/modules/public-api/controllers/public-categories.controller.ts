import { Controller, Get, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiOAuth2, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../database/prisma.service';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { RequireScopes } from '../decorators/require-scopes.decorator';
import { ApiAccountHeader, ApiPublicErrors } from '../docs/public-api-docs.decorators';
import { PublicCategoryList } from '../dto/public-expense.dto';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { listPublicCategories } from '../public-categories.query';
import { CATEGORY_TIER1_ENCRYPTED_FIELDS } from '../public-encryption-fields';
import type { PublicApiRequest } from '../public-api.types';

/**
 * `GET /public/v1/categories` — exactly the categories an expense write accepts as `category_id`:
 * the account's own live EXPENSE categories (`publicCategoryWhere`, shared with the write check so
 * the two cannot drift). Global system rows are not listed: the write path cannot store them.
 * Income categories are not part of the phase 1 surface.
 */
@ApiAccountHeader()
@ApiTags('Categories')
@Controller('public/v1/categories')
@UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicCategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequireScopes('categories:read')
  @ApiOperation({ operationId: 'listCategories' })
  @ApiOAuth2(['categories:read'], 'oauth2')
  @ApiOkResponse({ type: PublicCategoryList, description: '' })
  @ApiPublicErrors()
  async list(@Req() req: PublicApiRequest): Promise<PublicCategoryList> {
    const rows = await listPublicCategories(this.prisma, req.accountId);
    // Tier 1: category names are end-to-end encrypted in the app (Ruling 15).
    const encrypted = req.oauth.encryptionTier >= 1;
    return {
      data: rows.map((c) => ({
        id: c.id,
        name: encrypted ? null : c.name,
        parent_id: c.parentId ?? null,
        icon: c.icon ?? null,
        color: c.color ?? null,
        type: c.type,
        encrypted_fields: encrypted ? [...CATEGORY_TIER1_ENCRYPTED_FIELDS] : [],
      })),
    };
  }
}

import { Controller, Get, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiOAuth2, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../../database/prisma.service';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { RequireScopes } from '../decorators/require-scopes.decorator';
import { ApiAccountHeader, ApiPublicErrors } from '../docs/public-api-docs.decorators';
import { ListPublicCategoriesQueryDto, PublicCategoryList } from '../dto/public-expense.dto';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { readPublicCategoryList } from '../public-read.views';
import type { PublicApiRequest } from '../public-api.types';

/**
 * `GET /public/v1/categories` — the account's own live categories of `type` (expense by default, or income).
 * `publicCategoryWhere` is shared with the write checks, so with the default type this is exactly what an
 * expense write accepts as `category_id`, and with `type=income` what an income write accepts. Global system rows are not listed: the write path cannot store them.
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
  async list(@Req() req: PublicApiRequest, @Query() q: ListPublicCategoriesQueryDto): Promise<PublicCategoryList> {
    // Shared with the MCP `list_categories` tool (public-read.views.ts); tier 1 withholds names.
    return readPublicCategoryList(this.prisma, req.accountId, req.oauth.encryptionTier, q.type);
  }
}

import { Controller, Get, Query, Req, UseFilters, UseGuards } from '@nestjs/common';
import { ApiOAuth2, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { RequireScopes } from '../decorators/require-scopes.decorator';
import { ApiAccountHeader, ApiPublicErrors } from '../docs/public-api-docs.decorators';
import {
  PublicAnalyticsByCategory,
  PublicAnalyticsByCategoryQueryDto,
  PublicAnalyticsMonthly,
  PublicAnalyticsQueryDto,
  PublicAnalyticsSummary,
} from '../dto/public-analytics.dto';
import { PublicApiExceptionFilter } from '../filters/public-api-exception.filter';
import { PublicApiAuthGuard } from '../guards/public-api-auth.guard';
import { PublicAnalyticsService } from '../public-analytics.service';
import type { PublicApiRequest } from '../public-api.types';

/**
 * `GET /public/v1/analytics/summary|by-category|monthly` — server-computed totals in one currency,
 * by the counting rules in `PublicAnalyticsService`. Read-only, so open at encryption tier 1 too
 * (amounts are plaintext; category names are withheld). The user is the grantor, whose display
 * currency is the default.
 */
@ApiAccountHeader()
@ApiTags('Analytics')
@Controller('public/v1/analytics')
@UseGuards(PublicApiEnabledGuard, PublicApiAuthGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicAnalyticsController {
  constructor(private readonly analytics: PublicAnalyticsService) {}

  @Get('summary')
  @RequireScopes('analytics:read')
  @ApiOperation({ operationId: 'getAnalyticsSummary' })
  @ApiOAuth2(['analytics:read'], 'oauth2')
  @ApiOkResponse({ type: PublicAnalyticsSummary, description: '' })
  @ApiPublicErrors()
  summary(
    @Req() req: PublicApiRequest,
    @Query() q: PublicAnalyticsQueryDto
  ): Promise<PublicAnalyticsSummary> {
    return this.analytics.summary(req.accountId, req.user.id, q, req.oauth.encryptionTier);
  }

  @Get('by-category')
  @RequireScopes('analytics:read')
  @ApiOperation({ operationId: 'getAnalyticsByCategory' })
  @ApiOAuth2(['analytics:read'], 'oauth2')
  @ApiOkResponse({ type: PublicAnalyticsByCategory, description: '' })
  @ApiPublicErrors()
  byCategory(
    @Req() req: PublicApiRequest,
    @Query() q: PublicAnalyticsByCategoryQueryDto
  ): Promise<PublicAnalyticsByCategory> {
    return this.analytics.byCategory(
      req.accountId,
      req.user.id,
      { from: q.from, to: q.to, currency: q.currency, type: q.type ?? 'expense' },
      req.oauth.encryptionTier
    );
  }

  @Get('monthly')
  @RequireScopes('analytics:read')
  @ApiOperation({ operationId: 'getAnalyticsMonthly' })
  @ApiOAuth2(['analytics:read'], 'oauth2')
  @ApiOkResponse({ type: PublicAnalyticsMonthly, description: '' })
  @ApiPublicErrors()
  monthly(
    @Req() req: PublicApiRequest,
    @Query() q: PublicAnalyticsQueryDto
  ): Promise<PublicAnalyticsMonthly> {
    return this.analytics.monthly(req.accountId, req.user.id, q, req.oauth.encryptionTier);
  }
}

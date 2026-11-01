import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';
import { PublicApiEnabledGuard } from './guards/public-api-enabled.guard';
import { OAuthAuthorizeService } from './oauth-authorize.service';
import { AuthorizeApproveDto, AuthorizePreviewQueryDto } from './dto/authorize.dto';

/**
 * Backend of the consent page (`app.ai-budget.pl/authorize`), called by our SPA with the user's JWT
 * under `/api/v1`. Not part of the public (third-party) surface — the token endpoint is elsewhere.
 *
 * No AccountContextGuard / ViewerBlockGuard: the target account is a body field (not the
 * X-Account-Id header) and the service checks the caller's membership and owner/editor role on
 * it directly, so a viewer is refused there with 403.
 */
@Controller('oauth/authorize')
@UseGuards(PublicApiEnabledGuard, JwtAuthGuard)
export class OAuthAuthorizeController {
  constructor(private readonly authorize: OAuthAuthorizeService) {}

  @Get('preview')
  preview(@Req() req: AuthenticatedRequest, @Query() q: AuthorizePreviewQueryDto) {
    return this.authorize.preview(req.user.id, q);
  }

  @Post('approve')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  approve(@Req() req: AuthenticatedRequest, @Body() dto: AuthorizeApproveDto) {
    return this.authorize.approve(req.user.id, dto);
  }
}

import { Controller, Delete, Get, HttpCode, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';
import { PublicApiEnabledGuard } from './guards/public-api-enabled.guard';
import { OAuthGrantsService } from './oauth-grants.service';

/**
 * "Connected apps": spans every account where the caller is owner/editor, so deliberately no
 * AccountContextGuard. Membership is enforced per query in OAuthGrantsService.
 */
@Controller('connected-apps')
@UseGuards(PublicApiEnabledGuard, JwtAuthGuard)
export class ConnectedAppsController {
  constructor(private readonly grants: OAuthGrantsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.grants.listConnectedApps(req.user.id);
  }

  @Delete(':grantId')
  @HttpCode(204)
  async revoke(@Req() req: AuthenticatedRequest, @Param('grantId') grantId: string): Promise<void> {
    await this.grants.revokeAsMember(req.user.id, grantId);
  }
}

import { Module } from '@nestjs/common';
import { DeveloperAppsController } from './developer-apps.controller';
import { OAuthAuthorizeController } from './oauth-authorize.controller';
import { OAuthAuthorizeService } from './oauth-authorize.service';
import { ConnectedAppsController } from './connected-apps.controller';
import { OAuthTokenCleanupCron } from './oauth-token-cleanup.cron';
import { OAuthGrantsService } from './oauth-grants.service';
import { OAuthClientsService } from './oauth-clients.service';
import { PublicApiEnabledGuard } from './guards/public-api-enabled.guard';

@Module({
  controllers: [DeveloperAppsController, OAuthAuthorizeController, ConnectedAppsController],
  providers: [
    OAuthClientsService,
    OAuthGrantsService,
    OAuthAuthorizeService,
    PublicApiEnabledGuard,
    OAuthTokenCleanupCron,
  ],
  exports: [OAuthClientsService, OAuthGrantsService],
})
export class OAuthModule {}

import { Module } from '@nestjs/common';
import { OAuthModule } from './oauth.module';
import { OAuthTokenController } from './oauth-token.controller';
import { OAuthTokenService } from './oauth-token.service';
import { PublicApiEnabledGuard } from './guards/public-api-enabled.guard';

/**
 * The third-party-facing OAuth surface (token + revoke) in its own module, so the public Swagger
 * document can include exactly [PublicApiModule, OAuthPublicModule] and the internal consent /
 * developer routes stay out of it by construction (Ruling 3).
 */
@Module({
  imports: [OAuthModule],
  controllers: [OAuthTokenController],
  providers: [OAuthTokenService, PublicApiEnabledGuard],
  exports: [OAuthTokenService],
})
export class OAuthPublicModule {}

import { Module } from '@nestjs/common';
import { OAuthModule } from './oauth.module';
import { OAuthTokenController } from './oauth-token.controller';
import { OAuthTokenService } from './oauth-token.service';
import { PublicApiEnabledGuard } from './guards/public-api-enabled.guard';
import { McpEnabledGuard } from './guards/mcp-enabled.guard';
import { OAuthMetadataController } from './oauth-metadata.controller';
import { OAuthRegisterController } from './oauth-register.controller';
import { OAuthRegisterService } from './oauth-register.service';

/**
 * The third-party-facing OAuth surface (token + revoke) in its own module, so the public Swagger
 * document can include exactly [PublicApiModule, OAuthPublicModule] and the internal consent /
 * developer routes stay out of it by construction (Ruling 3).
 *
 * Also the MCP connector's discovery documents and dynamic client registration (both behind
 * McpEnabledGuard, and @ApiExcludeController so the published REST document is unchanged).
 */
@Module({
  imports: [OAuthModule],
  controllers: [OAuthTokenController, OAuthMetadataController, OAuthRegisterController],
  providers: [OAuthTokenService, OAuthRegisterService, PublicApiEnabledGuard, McpEnabledGuard],
  exports: [OAuthTokenService],
})
export class OAuthPublicModule {}

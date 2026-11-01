import { Module } from '@nestjs/common';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { PublicDocsController } from './public-docs.controller';

/**
 * The `/public/docs` redirect. The Swagger UI and JSON routes themselves are registered in
 * `main.ts` through `setupPublicDocs` (only when PUBLIC_API_ENABLED is on).
 */
@Module({
  controllers: [PublicDocsController],
  providers: [PublicApiEnabledGuard],
})
export class PublicDocsModule {}

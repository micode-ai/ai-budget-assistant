import { Module } from '@nestjs/common';
import { EmbeddingService } from './services/embedding.service';

/**
 * Standalone module for the EmbeddingService so it can be imported by
 * AiModule alongside its consumers (CategoriesModule, TagsModule,
 * ProjectsModule) without creating a circular dependency. EmbeddingService
 * itself only depends on PrismaService (already global) and ConfigService.
 */
@Module({
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}

import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { AccountsModule } from '../accounts/accounts.module';
import { EmbeddingModule } from '../ai/embedding.module';

@Module({
  imports: [AccountsModule, EmbeddingModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}

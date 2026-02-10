import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [BudgetsModule, SubscriptionsModule],
  controllers: [InsightsController],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}

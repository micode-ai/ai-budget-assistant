import { Module } from '@nestjs/common';
import { InvestmentsController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { InvestmentInsightsService } from './investment-insights.service';
import { TwelveDataService } from './twelve-data.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [SubscriptionsModule],
  controllers: [InvestmentsController],
  providers: [InvestmentsService, InvestmentInsightsService, TwelveDataService],
  exports: [InvestmentsService, InvestmentInsightsService, TwelveDataService],
})
export class InvestmentsModule {}

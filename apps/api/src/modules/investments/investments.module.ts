import { Module } from '@nestjs/common';
import { InvestmentsController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { TwelveDataService } from './twelve-data.service';

@Module({
  controllers: [InvestmentsController],
  providers: [InvestmentsService, TwelveDataService],
  exports: [InvestmentsService, TwelveDataService],
})
export class InvestmentsModule {}

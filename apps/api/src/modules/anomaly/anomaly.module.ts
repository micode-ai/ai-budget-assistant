import { Module } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';
import { AnomalyController } from './anomaly.controller';
import { PriceHistoryModule } from '../price-history/price-history.module';

@Module({
  imports: [PriceHistoryModule],
  controllers: [AnomalyController],
  providers: [AnomalyService],
  exports: [AnomalyService],
})
export class AnomalyModule {}

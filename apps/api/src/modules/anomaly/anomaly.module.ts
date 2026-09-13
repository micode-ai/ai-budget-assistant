import { Module } from '@nestjs/common';
import { AnomalyService } from './anomaly.service';
import { AnomalyDetectorsService } from './anomaly-detectors.service';
import { AnomalyAlertWriterService } from './anomaly-alert-writer.service';
import { AnomalyController } from './anomaly.controller';
import { PriceHistoryModule } from '../price-history/price-history.module';

@Module({
  imports: [PriceHistoryModule],
  controllers: [AnomalyController],
  providers: [AnomalyService, AnomalyDetectorsService, AnomalyAlertWriterService],
  exports: [AnomalyService],
})
export class AnomalyModule {}

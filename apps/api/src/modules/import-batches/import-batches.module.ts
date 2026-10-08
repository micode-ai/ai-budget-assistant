import { Module } from '@nestjs/common';
import { ImportBatchesController } from './import-batches.controller';
import { ImportBatchesService } from './import-batches.service';
import { ImportReportService } from './import-report.service';
import { CurrencyExchangeModule } from '../currency-exchange/currency-exchange.module';

@Module({
  imports: [CurrencyExchangeModule],
  controllers: [ImportBatchesController],
  providers: [ImportBatchesService, ImportReportService],
  exports: [ImportBatchesService],
})
export class ImportBatchesModule {}

import { Module } from '@nestjs/common';
import { ImportBatchesModule } from '../import-batches/import-batches.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { ImportBankController } from './import-bank.controller';
import { ImportBankService } from './import-bank.service';
import { MappingService } from './mapping/mapping.service';

@Module({
  imports: [ImportBatchesModule, AnomalyModule],
  controllers: [ImportBankController],
  providers: [ImportBankService, MappingService],
})
export class ImportBankModule {}

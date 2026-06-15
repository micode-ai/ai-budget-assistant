import { Module } from '@nestjs/common';
import { ImportBatchesModule } from '../import-batches/import-batches.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';
import { ImportWiseController } from './import-wise.controller';
import { ImportWiseService } from './import-wise.service';

@Module({
  imports: [ImportBatchesModule, AnomalyModule, MerchantRulesModule],
  controllers: [ImportWiseController],
  providers: [ImportWiseService],
})
export class ImportWiseModule {}

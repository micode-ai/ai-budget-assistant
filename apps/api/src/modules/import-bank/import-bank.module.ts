import { Module } from '@nestjs/common';
import { ImportBatchesModule } from '../import-batches/import-batches.module';
import { AnomalyModule } from '../anomaly/anomaly.module';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ImportBankController } from './import-bank.controller';
import { ImportBankService } from './import-bank.service';
import { MappingService } from './mapping/mapping.service';
import { SignatureService } from './ai/signature.service';
import { StatementAiService } from './ai/statement-ai.service';

@Module({
  imports: [ImportBatchesModule, AnomalyModule, MerchantRulesModule, SubscriptionsModule],
  controllers: [ImportBankController],
  providers: [ImportBankService, MappingService, SignatureService, StatementAiService],
})
export class ImportBankModule {}

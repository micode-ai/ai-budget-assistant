import { Module } from '@nestjs/common';
import { ImportBankController } from './import-bank.controller';
import { ImportBankService } from './import-bank.service';
import { MappingService } from './mapping/mapping.service';

@Module({
  controllers: [ImportBankController],
  providers: [ImportBankService, MappingService],
})
export class ImportBankModule {}

import { Module } from '@nestjs/common';
import { ImportBatchesController } from './import-batches.controller';
import { ImportBatchesService } from './import-batches.service';

@Module({
  controllers: [ImportBatchesController],
  providers: [ImportBatchesService],
  exports: [ImportBatchesService],
})
export class ImportBatchesModule {}

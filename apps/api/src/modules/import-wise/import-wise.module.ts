import { Module } from '@nestjs/common';
import { ImportBatchesModule } from '../import-batches/import-batches.module';
import { ImportWiseController } from './import-wise.controller';
import { ImportWiseService } from './import-wise.service';

@Module({
  imports: [ImportBatchesModule],
  controllers: [ImportWiseController],
  providers: [ImportWiseService],
})
export class ImportWiseModule {}

import { Module } from '@nestjs/common';
import { ImportWiseController } from './import-wise.controller';
import { ImportWiseService } from './import-wise.service';

@Module({
  controllers: [ImportWiseController],
  providers: [ImportWiseService],
})
export class ImportWiseModule {}

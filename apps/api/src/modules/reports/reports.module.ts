import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { DigestService } from './digest.service';
import { CsvGenerator } from './generators/csv-generator';
import { PdfGenerator } from './generators/pdf-generator';
import { ExcelGenerator } from './generators/excel-generator';
import { DatabaseModule } from '../../database/database.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [DatabaseModule, SubscriptionsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    DigestService,
    CsvGenerator,
    PdfGenerator,
    ExcelGenerator,
  ],
  exports: [ReportsService, DigestService],
})
export class ReportsModule {}

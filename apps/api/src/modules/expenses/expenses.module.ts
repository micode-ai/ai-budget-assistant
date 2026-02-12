import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { BudgetsModule } from '../budgets/budgets.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [BudgetsModule, GamificationModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}

import {
  Controller,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { DebtsService } from './debts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';

@Controller('debts')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Get('summary')
  async getSummary(@Req() req: AuthenticatedRequest) {
    return this.debtsService.getDebtSummary(req.accountId);
  }
}

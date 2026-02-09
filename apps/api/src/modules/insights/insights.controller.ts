import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';

@Controller('insights')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  async getInsights(@Req() req: AuthenticatedRequest) {
    return this.insightsService.getInsights(req.accountId);
  }
}

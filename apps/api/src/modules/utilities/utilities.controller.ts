import { Body, Controller, Delete, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { UtilitiesService } from './utilities.service';
import { UpsertUtilityReadingDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';

@Controller('utilities')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class UtilitiesController {
  constructor(private readonly utilities: UtilitiesService) {}

  @Get('summary')
  summary(@Req() req: AuthenticatedRequest, @Query('property') property?: string) {
    return this.utilities.getSummary(req.accountId, req.user.currencyCode || 'USD', property || undefined);
  }

  @Get('readings/:expenseId')
  async reading(@Req() req: AuthenticatedRequest, @Param('expenseId') expenseId: string) {
    return (await this.utilities.findForExpense(req.accountId, expenseId)) ?? null;
  }

  @Put('readings/:expenseId')
  @UseGuards(new ViewerBlockGuard())
  upsert(@Req() req: AuthenticatedRequest, @Param('expenseId') expenseId: string, @Body() dto: UpsertUtilityReadingDto) {
    return this.utilities.upsert(req.accountId, expenseId, dto);
  }

  @Delete('readings/:expenseId')
  @UseGuards(new ViewerBlockGuard())
  remove(@Req() req: AuthenticatedRequest, @Param('expenseId') expenseId: string) {
    return this.utilities.remove(req.accountId, expenseId);
  }
}

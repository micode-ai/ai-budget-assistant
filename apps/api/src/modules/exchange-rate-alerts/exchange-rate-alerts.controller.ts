import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { ExchangeRateAlertsService } from './exchange-rate-alerts.service';
import { CreateExchangeRateWatchDto } from './dto';

// Personal resource — not account-scoped data. Guard stays for consistency with every
// other controller (mobile always sends X-Account-Id), but the service below ignores
// req.accountId entirely; same precedent as WalletController.getSummaries. No
// ViewerBlockGuard: a viewer may set a personal rate alert exactly like they may set a
// personal theme accent or display currency.
@Controller('rate-watches')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class ExchangeRateAlertsController {
  constructor(private readonly service: ExchangeRateAlertsService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateExchangeRateWatchDto) {
    return this.service.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.service.findAllForUser(req.user.id);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.service.remove(req.user.id, id);
    return { success: true };
  }
}

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { SetWalletBalanceDto } from './dto';

@Controller('wallet')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @UseGuards(new ViewerBlockGuard())
  async setBalance(@Req() req: AuthenticatedRequest, @Body() dto: SetWalletBalanceDto) {
    return this.walletService.setBalance(req.accountId, req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.walletService.findAll(req.accountId);
  }

  @Get('summary')
  async getSummary(@Req() req: AuthenticatedRequest) {
    return this.walletService.getSummary(req.accountId);
  }

  @Get('balance-history')
  async getBalanceHistory(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    const parsedDays = days ? parseInt(days, 10) : 30;
    const safeDays = Number.isNaN(parsedDays) ? 30 : parsedDays;
    return this.walletService.getBalanceHistory(req.accountId, safeDays);
  }

  @Get('balance-history/monthly')
  async getMonthlyBalanceHistory(
    @Req() req: AuthenticatedRequest,
    @Query('months') months?: string,
  ) {
    const parsedMonths = months ? parseInt(months, 10) : 6;
    const safeMonths = Number.isNaN(parsedMonths) ? 6 : parsedMonths;
    return this.walletService.getMonthlyBalanceHistory(req.accountId, safeMonths);
  }

  @Delete(':currencyCode')
  @UseGuards(new ViewerBlockGuard())
  async remove(@Req() req: AuthenticatedRequest, @Param('currencyCode') currencyCode: string) {
    return this.walletService.remove(req.accountId, currencyCode);
  }
}

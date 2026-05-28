import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';

@Controller('wallet')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @UseGuards(new ViewerBlockGuard())
  async setBalance(@Req() req: AuthenticatedRequest, @Body() dto: any) {
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

  @Delete(':currencyCode')
  @UseGuards(new ViewerBlockGuard())
  async remove(@Req() req: AuthenticatedRequest, @Param('currencyCode') currencyCode: string) {
    return this.walletService.remove(req.accountId, currencyCode);
  }
}

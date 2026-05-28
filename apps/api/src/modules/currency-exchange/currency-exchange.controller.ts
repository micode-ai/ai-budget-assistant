import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CurrencyExchangeService } from './currency-exchange.service';
import { ExchangeRateService } from './exchange-rate.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';

@Controller('currency-exchanges')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class CurrencyExchangeController {
  constructor(
    private readonly exchangeService: CurrencyExchangeService,
    private readonly rateService: ExchangeRateService,
  ) {}

  @Post()
  @UseGuards(new ViewerBlockGuard())
  async create(@Req() req: AuthenticatedRequest, @Body() dto: any) {
    return this.exchangeService.create(req.accountId, req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest, @Query() filters: any) {
    return this.exchangeService.findAll(req.accountId, filters);
  }

  @Get('rates')
  async getRates(@Query('base') base: string) {
    return this.rateService.getRates(base || 'USD');
  }

  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.exchangeService.findOne(req.accountId, id);
  }

  @Patch(':id')
  @UseGuards(new ViewerBlockGuard())
  async update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: any) {
    return this.exchangeService.update(req.accountId, id, dto);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.exchangeService.remove(req.accountId, id);
  }
}

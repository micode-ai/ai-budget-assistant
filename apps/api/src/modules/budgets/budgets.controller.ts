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
import { BudgetsService } from './budgets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';

@Controller('budgets')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: any) {
    return this.budgetsService.create(req.accountId, req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest, @Query() filters: any) {
    return this.budgetsService.findAll(req.accountId, filters);
  }

  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetsService.findOne(req.accountId, id);
  }

  @Get(':id/history')
  async getHistory(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('periods') periods?: string,
  ) {
    return this.budgetsService.getHistory(req.accountId, id, periods ? parseInt(periods, 10) : 6);
  }

  @Get(':id/progress')
  async getProgress(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetsService.getProgress(req.accountId, id);
  }

  @Patch(':id')
  async update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: any) {
    return this.budgetsService.update(req.accountId, id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetsService.remove(req.accountId, id);
  }
}

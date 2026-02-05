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
import { AuthenticatedRequest } from '../../common/types';

@Controller('budgets')
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: any) {
    return this.budgetsService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest, @Query() filters: any) {
    return this.budgetsService.findAll(req.user.id, filters);
  }

  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetsService.findOne(req.user.id, id);
  }

  @Get(':id/progress')
  async getProgress(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetsService.getProgress(req.user.id, id);
  }

  @Patch(':id')
  async update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: any) {
    return this.budgetsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.budgetsService.remove(req.user.id, id);
  }
}

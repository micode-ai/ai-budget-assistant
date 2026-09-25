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
import { IncomesService } from './incomes.service';
import { IncomeBulkService } from './income-bulk.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { CreateIncomeDto, UpdateIncomeDto, IncomeFiltersDto, BulkUpdateIncomesDto } from './dto';
import { AuthenticatedRequest } from '../../common/types';

@Controller('incomes')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class IncomesController {
  constructor(
    private readonly incomesService: IncomesService,
    private readonly incomeBulkService: IncomeBulkService,
  ) {}

  @Post()
  @UseGuards(new ViewerBlockGuard())
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateIncomeDto) {
    return this.incomesService.create(req.accountId, req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest, @Query() filters: IncomeFiltersDto) {
    return this.incomesService.findAll(req.accountId, filters);
  }

  // MUST be declared before @Patch(':id') — Express matches routes in
  // declaration order, and a :id route placed first would capture
  // "/incomes/bulk" as id="bulk" and silently no-op the bulk update
  // (same trap expenses.controller.ts already documents, ABA-166).
  @Patch('bulk')
  @UseGuards(new ViewerBlockGuard())
  async bulkUpdate(@Req() req: AuthenticatedRequest, @Body() dto: BulkUpdateIncomesDto) {
    return this.incomeBulkService.bulkUpdate(req.accountId, dto);
  }

  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.incomesService.findOne(req.accountId, id);
  }

  @Patch(':id')
  @UseGuards(new ViewerBlockGuard())
  async update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateIncomeDto) {
    return this.incomesService.update(req.accountId, id, dto);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.incomesService.remove(req.accountId, id);
  }
}

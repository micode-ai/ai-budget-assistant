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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { CreateIncomeDto, UpdateIncomeDto, IncomeFiltersDto } from './dto';
import { AuthenticatedRequest } from '../../common/types';

@Controller('incomes')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class IncomesController {
  constructor(private readonly incomesService: IncomesService) {}

  @Post()
  @UseGuards(new ViewerBlockGuard())
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateIncomeDto) {
    return this.incomesService.create(req.accountId, req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest, @Query() filters: IncomeFiltersDto) {
    return this.incomesService.findAll(req.accountId, filters);
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

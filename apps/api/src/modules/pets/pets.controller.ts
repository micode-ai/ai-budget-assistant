import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { PetsService } from './pets.service';
import { BulkPetCostDto, CreatePetDto, SetPetCostDto, UpdatePetDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { PET_HISTORY_PERIODS } from './pet-history.util';

@Controller('pets')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.pets.findAll(req.accountId);
  }

  @Post()
  @UseGuards(new ViewerBlockGuard())
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePetDto) {
    return this.pets.create(req.accountId, req.user.id, dto);
  }

  // Declared before the `:id` routes so `costs` is not captured as an id.
  @Delete('costs/:expenseId')
  @UseGuards(new ViewerBlockGuard())
  removeCost(@Req() req: AuthenticatedRequest, @Param('expenseId') expenseId: string) {
    return this.pets.removeCost(req.accountId, expenseId);
  }

  @Patch(':id')
  @UseGuards(new ViewerBlockGuard())
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdatePetDto) {
    return this.pets.update(req.accountId, id, dto);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.pets.remove(req.accountId, id);
  }

  @Get(':id/history')
  history(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('months') monthsRaw?: string) {
    const months = monthsRaw === undefined || monthsRaw === '' ? 12 : Number(monthsRaw);
    if (!(PET_HISTORY_PERIODS as readonly number[]).includes(months)) {
      throw new BadRequestException(`months must be one of ${PET_HISTORY_PERIODS.join(', ')}`);
    }
    // Display currency from the user, never from a row.
    return this.pets.getHistory(req.accountId, id, months, req.user.currencyCode || 'USD');
  }

  @Get(':id/costs')
  costs(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.pets.listCosts(req.accountId, id);
  }

  @Post(':id/costs/bulk')
  @UseGuards(new ViewerBlockGuard())
  setCostsBulk(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: BulkPetCostDto) {
    return this.pets.setCostsBulk(req.accountId, id, dto);
  }

  @Put(':id/costs/:expenseId')
  @UseGuards(new ViewerBlockGuard())
  setCost(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: SetPetCostDto,
  ) {
    return this.pets.setCost(req.accountId, id, expenseId, dto);
  }
}

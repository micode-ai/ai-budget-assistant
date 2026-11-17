import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import {
  BulkVehicleCostDto,
  CreateVehicleDto,
  MoveVehicleDto,
  SetVehicleCategoryRulesDto,
  SetVehicleCostDto,
  UpdateVehicleDto,
  UpsertFuelLogDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { HISTORY_PERIODS } from './vehicle-history.util';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.vehicles.findAll(req.accountId);
  }

  @Post()
  @UseGuards(new ViewerBlockGuard())
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create(req.accountId, req.user.id, dto);
  }

  // Declared before the `:id` routes so `fuel-logs` is not captured as an id.
  @Get('fuel-logs/:expenseId')
  fuelLogForExpense(@Req() req: AuthenticatedRequest, @Param('expenseId') expenseId: string) {
    return this.vehicles.findFuelLogForExpense(req.accountId, expenseId);
  }

  /** Takes a non-fuel cost off an expense (ABA-803); declared before `:id`. */
  @Delete('costs/:expenseId')
  @UseGuards(new ViewerBlockGuard())
  removeCost(@Req() req: AuthenticatedRequest, @Param('expenseId') expenseId: string) {
    return this.vehicles.removeCost(req.accountId, expenseId);
  }

  @Delete('fuel-logs/:expenseId')
  @UseGuards(new ViewerBlockGuard())
  removeFuelLog(@Req() req: AuthenticatedRequest, @Param('expenseId') expenseId: string) {
    return this.vehicles.removeFuelLog(req.accountId, expenseId);
  }

  @Patch(':id')
  @UseGuards(new ViewerBlockGuard())
  update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehicles.update(req.accountId, id, dto);
  }

  /** To another account the caller can edit; only a vehicle with no fill-ups (ABA-801). */
  @Post(':id/move')
  @UseGuards(new ViewerBlockGuard())
  move(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: MoveVehicleDto) {
    return this.vehicles.move(req.accountId, req.user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.vehicles.remove(req.accountId, id);
  }

  @Get(':id/stats')
  stats(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    // Display currency from the user, never from a row (display-currency-conversion).
    return this.vehicles.getStats(req.accountId, id, req.user.currencyCode || 'USD');
  }

  /** The vehicle screen (ABA-811); `months` is one of HISTORY_PERIODS, 0 = all time. */
  @Get(':id/history')
  history(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query('months') monthsRaw?: string) {
    const months = monthsRaw === undefined || monthsRaw === '' ? 12 : Number(monthsRaw);
    if (!(HISTORY_PERIODS as readonly number[]).includes(months)) {
      throw new BadRequestException(`months must be one of ${HISTORY_PERIODS.join(', ')}`);
    }
    return this.vehicles.getHistory(req.accountId, id, months, req.user.currencyCode || 'USD');
  }

  @Get(':id/costs')
  costs(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.vehicles.listCosts(req.accountId, id);
  }

  /** Many expenses at once (ABA-805); a POST, so no `:expenseId` route can capture `bulk`. */
  @Post(':id/costs/bulk')
  @UseGuards(new ViewerBlockGuard())
  setCostsBulk(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: BulkVehicleCostDto) {
    return this.vehicles.setCostsBulk(req.accountId, id, dto);
  }

  @Put(':id/costs/:expenseId')
  @UseGuards(new ViewerBlockGuard())
  setCost(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: SetVehicleCostDto,
  ) {
    return this.vehicles.setCost(req.accountId, id, expenseId, dto);
  }

  @Get(':id/category-rules')
  categoryRules(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.vehicles.getCategoryRules(req.accountId, id);
  }

  @Put(':id/category-rules')
  @UseGuards(new ViewerBlockGuard())
  setCategoryRules(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: SetVehicleCategoryRulesDto) {
    return this.vehicles.setCategoryRules(req.accountId, id, dto);
  }

  @Get(':id/fuel-logs')
  fuelLogs(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.vehicles.listFuelLogs(req.accountId, id);
  }

  @Put(':id/fuel-logs/:expenseId')
  @UseGuards(new ViewerBlockGuard())
  upsertFuelLog(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpsertFuelLogDto,
  ) {
    return this.vehicles.upsertFuelLog(req.accountId, id, expenseId, dto);
  }
}

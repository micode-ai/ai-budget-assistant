import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto, UpdateVehicleDto, UpsertFuelLogDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';

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

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.vehicles.remove(req.accountId, id);
  }

  @Get(':id/stats')
  stats(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.vehicles.getStats(req.accountId, id);
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

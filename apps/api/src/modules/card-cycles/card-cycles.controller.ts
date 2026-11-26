import { Body, Controller, Delete, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { CardCyclesService } from './card-cycles.service';
import { UpsertCardCycleDto } from './dto';

@Controller('card-cycles')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class CardCyclesController {
  constructor(private readonly service: CardCyclesService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.accountId);
  }

  @Put()
  @UseGuards(new ViewerBlockGuard())
  upsert(@Req() req: AuthenticatedRequest, @Body() dto: UpsertCardCycleDto) {
    return this.service.upsert(req.accountId, req.user.id, dto);
  }

  @Delete()
  @UseGuards(new ViewerBlockGuard())
  remove(@Req() req: AuthenticatedRequest) {
    return this.service.remove(req.accountId);
  }
}

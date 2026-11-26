import { Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';
import { MerchantCapsService } from './merchant-caps.service';
import { UpsertMerchantCapDto } from './dto';

@Controller('merchant-caps')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class MerchantCapsController {
  constructor(private readonly service: MerchantCapsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.accountId);
  }

  @Put()
  @UseGuards(new ViewerBlockGuard())
  upsert(@Req() req: AuthenticatedRequest, @Body() dto: UpsertMerchantCapDto) {
    return this.service.upsert(req.accountId, req.user.id, dto);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.accountId, id);
  }
}

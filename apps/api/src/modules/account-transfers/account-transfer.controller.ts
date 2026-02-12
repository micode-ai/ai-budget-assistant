import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AccountTransferService } from './account-transfer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';

@Controller('account-transfers')
@UseGuards(JwtAuthGuard)
export class AccountTransferController {
  constructor(private readonly service: AccountTransferService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() dto: any) {
    return this.service.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.service.findAll(req.user.id);
  }

  @Delete(':id')
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.user.id, id);
  }
}

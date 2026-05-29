import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AccountTransferService } from './account-transfer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { CreateAccountTransferDto, UpdateAccountTransferDto } from './dto';
import { AuthenticatedRequest } from '../../common/types';

@Controller('account-transfers')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class AccountTransferController {
  constructor(private readonly service: AccountTransferService) {}

  @Post()
  @UseGuards(new ViewerBlockGuard())
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAccountTransferDto) {
    return this.service.create(req.accountId, req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.service.findAll(req.accountId, req.user.id);
  }

  @Patch(':id')
  @UseGuards(new ViewerBlockGuard())
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAccountTransferDto,
  ) {
    return this.service.update(req.accountId, req.user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.accountId, req.user.id, id);
  }
}

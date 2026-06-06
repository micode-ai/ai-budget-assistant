import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserSubscriptionsService } from './user-subscriptions.service';
import { CreateUserSubscriptionDto, UpdateUserSubscriptionDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { AuthenticatedRequest } from '../../common/types';

@Controller('user-subscriptions')
@UseGuards(JwtAuthGuard, AccountContextGuard)
export class UserSubscriptionsController {
  constructor(private readonly service: UserSubscriptionsService) {}

  @Get()
  findAll(@Req() req: AuthenticatedRequest) {
    return this.service.findAll(req.accountId);
  }

  @Post()
  @UseGuards(new ViewerBlockGuard())
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateUserSubscriptionDto) {
    return this.service.create(req.accountId, dto);
  }

  @Patch(':id')
  @UseGuards(new ViewerBlockGuard())
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateUserSubscriptionDto,
  ) {
    return this.service.update(req.accountId, id, dto);
  }

  @Delete(':id')
  @UseGuards(new ViewerBlockGuard())
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.accountId, id);
  }
}

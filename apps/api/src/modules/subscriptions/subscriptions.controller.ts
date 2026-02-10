import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';
import { SubscriptionsService } from './subscriptions.service';
import { CreateCheckoutSessionDto, CreatePortalSessionDto } from './dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  async getPlans(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getPlans(req.user.currencyCode);
  }

  @Get('current')
  async getCurrent(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getCurrent(req.user.id);
  }

  @Get('usage')
  async getUsage(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getUsageStats(req.user.id);
  }

  @Post('checkout')
  async createCheckout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.subscriptionsService.createCheckoutSession(
      req.user.id,
      dto.priceId,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  @Post('portal')
  async createPortal(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePortalSessionDto,
  ) {
    return this.subscriptionsService.createPortalSession(
      req.user.id,
      dto.returnUrl,
    );
  }
}

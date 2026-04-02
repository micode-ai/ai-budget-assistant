import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../common/types';
import { SubscriptionsService } from './subscriptions.service';
import { CreateCheckoutSessionDto, CreatePortalSessionDto } from './dto';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /**
   * Public redirect endpoint for Stripe success/cancel URLs.
   * Stripe requires https:// URLs, so we redirect to the app deep link.
   */
  @Get('redirect')
  handleRedirect(
    @Query('target') target: string,
    @Res() res: Response,
  ) {
    const allowed = [
      'aibudget://subscription/success',
      'aibudget://subscription/cancel',
      'aibudget://subscription',
    ];
    const url = allowed.includes(target) ? target : 'aibudget://subscription';
    return res.redirect(url);
  }

  @UseGuards(JwtAuthGuard)
  @Get('plans')
  async getPlans(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getPlans(req.user.currencyCode);
  }

  @UseGuards(JwtAuthGuard)
  @Get('current')
  async getCurrent(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getCurrent(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('usage')
  async getUsage(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getUsageStats(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('usage/details')
  async getUsageDetails(
    @Req() req: AuthenticatedRequest,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    const now = new Date();
    const m = month ? parseInt(month) : now.getMonth() + 1;
    const y = year ? parseInt(year) : now.getFullYear();
    return this.subscriptionsService.getUsageDetails(req.user.id, m, y);
  }

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
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

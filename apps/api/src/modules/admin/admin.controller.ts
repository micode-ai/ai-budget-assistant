import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminNotificationService } from './admin-notification.service';
import { ReferralsService } from '../referrals/referrals.service';

interface AdminRequest extends Request {
  user: { id: string; email: string; name: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly adminNotificationService: AdminNotificationService,
    private readonly referralsService: ReferralsService,
  ) {}

  private getIp(req: Request): string | null {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || null;
  }

  // ─── Dashboard ───────────────────────────────────

  @Get('dashboard')
  async getDashboard(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminAnalyticsService.getDashboard(startDate, endDate);
  }

  // ─── Users ───────────────────────────────────────

  @Get('users')
  async getUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('tier') tier?: string,
    @Query('isActive') isActive?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'asc' | 'desc',
  ) {
    return this.adminService.getUsers({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      search,
      tier,
      isActive,
      sortBy,
      order,
    });
  }

  @Get('users/:id')
  async getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; language?: string },
    @Req() req: AdminRequest,
  ) {
    const result = await this.adminService.updateUser(id, body);
    await this.adminService.logAction(req.user.id, 'user.update', 'user', id, body, this.getIp(req));
    return result;
  }

  @Patch('users/:id/subscription')
  async changeSubscriptionTier(
    @Param('id') id: string,
    @Body() body: { tier: 'free' | 'pro' | 'business' },
    @Req() req: AdminRequest,
  ) {
    const result = await this.adminService.changeSubscriptionTier(id, body.tier);
    await this.adminService.logAction(req.user.id, 'subscription.change_tier', 'user', id, { tier: body.tier }, this.getIp(req));
    return result;
  }

  @Patch('users/:id/ai-limit')
  async setCustomAiLimit(
    @Param('id') id: string,
    @Body() body: { customAiLimit: number | null },
    @Req() req: AdminRequest,
  ) {
    const result = await this.adminService.setCustomAiLimit(id, body.customAiLimit);
    await this.adminService.logAction(req.user.id, 'subscription.set_ai_limit', 'user', id, { customAiLimit: body.customAiLimit }, this.getIp(req));
    return result;
  }

  @Delete('users/:id')
  async deleteOrDeactivateUser(
    @Param('id') id: string,
    @Query('permanent') permanent: string,
    @Req() req: AdminRequest,
  ) {
    if (permanent === 'true') {
      return this.adminService.deleteUser(id, req.user.id, this.getIp(req));
    }
    const result = await this.adminService.deactivateUser(id);
    await this.adminService.logAction(req.user.id, 'user.deactivate', 'user', id, null, this.getIp(req));
    return result;
  }

  // ─── Communications ──────────────────────────────

  @Post('notifications/push')
  async sendPush(
    @Body() body: { userIds: string[]; title: string; body: string },
    @Req() req: AdminRequest,
  ) {
    const result = await this.adminNotificationService.sendPush(req.user.id, body.userIds, body.title, body.body);
    await this.adminService.logAction(req.user.id, 'notification.send_push', 'notification', null, { userIds: body.userIds, title: body.title }, this.getIp(req));
    return result;
  }

  @Post('notifications/email')
  async sendEmail(
    @Body() body: { userIds: string[]; subject: string; html: string },
    @Req() req: AdminRequest,
  ) {
    const result = await this.adminNotificationService.sendEmail(req.user.id, body.userIds, body.subject, body.html);
    await this.adminService.logAction(req.user.id, 'notification.send_email', 'notification', null, { userIds: body.userIds, subject: body.subject }, this.getIp(req));
    return result;
  }

  @Post('notifications/broadcast')
  async sendBroadcast(
    @Body() body: {
      type: 'push' | 'email';
      title?: string;
      subject?: string;
      body: string;
      html?: string;
      filters?: { tier?: string; isActive?: boolean; language?: string };
    },
    @Req() req: AdminRequest,
  ) {
    const result = await this.adminNotificationService.sendBroadcast(req.user.id, body.type, body);
    await this.adminService.logAction(req.user.id, 'notification.broadcast', 'notification', null, { type: body.type, filters: body.filters }, this.getIp(req));
    return result;
  }

  @Get('notifications/history')
  async getNotificationHistory(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('userId') userId?: string,
  ) {
    return this.adminNotificationService.getNotificationHistory(
      parseInt(page, 10),
      Math.min(parseInt(limit, 10), 100),
      userId,
    );
  }

  @Post('notifications/schedule')
  async scheduleNotification(
    @Body() body: {
      type: 'push' | 'email';
      title?: string;
      subject?: string;
      body: string;
      scheduledAt: string;
      userIds?: string[];
      filters?: Record<string, unknown>;
    },
    @Req() req: AdminRequest,
  ) {
    const result = await this.adminNotificationService.scheduleNotification(req.user.id, body);
    await this.adminService.logAction(req.user.id, 'notification.schedule', 'notification', result.id, { type: body.type, scheduledAt: body.scheduledAt }, this.getIp(req));
    return result;
  }

  @Get('notifications/scheduled')
  async getScheduledNotifications() {
    return this.adminNotificationService.getScheduledNotifications();
  }

  @Delete('notifications/scheduled/:id')
  async cancelScheduledNotification(
    @Param('id') id: string,
    @Req() req: AdminRequest,
  ) {
    const result = await this.adminNotificationService.cancelScheduledNotification(id);
    await this.adminService.logAction(req.user.id, 'notification.cancel_scheduled', 'notification', id, null, this.getIp(req));
    return result;
  }

  // ─── Analytics ───────────────────────────────────

  @Get('analytics/overview')
  async getAnalyticsOverview() {
    return this.adminAnalyticsService.getAnalyticsOverview();
  }

  @Get('analytics/ai-usage')
  async getAiUsageTrends(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminAnalyticsService.getAiUsageTrends(startDate, endDate);
  }

  @Get('analytics/subscriptions')
  async getSubscriptionStats() {
    return this.adminAnalyticsService.getSubscriptionStats();
  }

  // ─── Audit Log ───────────────────────────────────

  @Get('audit-log')
  async getAuditLog(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('action') action?: string,
    @Query('adminId') adminId?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.adminService.getAuditLog({
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 100),
      action,
      adminId,
      targetType,
    });
  }

  // ─── System Config ───────────────────────────────

  @Get('config')
  async getConfig() {
    return this.adminService.getAllConfig();
  }

  @Patch('config')
  async setConfig(@Body() body: { key: string; value: string }) {
    await this.adminService.setConfig(body.key, body.value);
    return { ok: true };
  }

  // ─── System ──────────────────────────────────────

  @Get('system/health')
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  // ─── Referrals ───────────────────────────────────

  @Get('referrals/stats')
  async getReferralStats() {
    return this.referralsService.getAdminStats();
  }

  @Get('referrals')
  async getReferralList(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.referralsService.getAdminList({
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }
}

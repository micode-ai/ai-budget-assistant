import { Controller, Get, Post, Put, Patch, Delete, Body, Query, UseGuards, Req, NotFoundException, BadRequestException } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountContextGuard } from '../../common/middleware/account-context.middleware';
import { AuthenticatedRequest } from '../../common/types';
import { TelegramLinkService } from '../telegram/telegram-link.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { WhatsAppLinkService } from '../whatsapp/whatsapp-link.service';
import { SlackLinkService } from '../slack/slack-link.service';
import type { SettleMethod } from '@budget/shared-types';
import { ReplaceUserPaymentMethodsDto } from './dto';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const THEME_MODES = ['light', 'dark', 'system'];
const PAYMENT_METHODS: SettleMethod[] = ['blik', 'revolut', 'paypal', 'cash', 'other'];
// PAYMENT_METHODS above and this regex must both stay byte-for-byte identical to
// AccountMemberPaymentInfoDto.paymentMethod's @IsIn list and .paymentHandle's
// regex in modules/accounts/dto/index.ts (trip settle-up) so the two payment-handle
// paths — user-level (this file) and account-member-level (trip wallet) — cannot
// drift apart. `+` and space are deliberate: BLIK handles are phone numbers.
const PAYMENT_HANDLE_REGEX = /^[A-Za-z0-9+ ._-]{1,50}$/;

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly telegramLinkService: TelegramLinkService,
    private readonly telegramBotService: TelegramBotService,
    private readonly whatsAppLinkService: WhatsAppLinkService,
    private readonly slackLinkService: SlackLinkService,
  ) {}

  @Get('me')
  async getProfile(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // `lastSyncAt` is stamped for every authenticated request by JwtStrategy →
    // LastActiveService (throttled), so this route no longer stamps it itself.
    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const paymentMethods = await this.usersService.getPaymentMethods(user.id);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
      aiResponseMode: user.aiResponseMode,
      aiModel: user.aiModel,
      contributeCommunityPrices: user.contributeCommunityPrices,
      themeMode: user.themeMode,
      accentColor: user.accentColor,
      paymentMethod: user.paymentMethod,
      paymentHandle: user.paymentHandle,
      paymentMethods,
      createdAt: user.createdAt,
      isAdmin: adminEmails.includes(user.email.toLowerCase()),
    };
  }

  /**
   * Replaces the whole payment-method list in one call — what a list-editing UI wants.
   * Guarded the same way as every other `/users/me` route (class-level `JwtAuthGuard`
   * only — this is a personal preference, not account-scoped, same precedent as the
   * legacy `paymentMethod`/`paymentHandle` pair on `PATCH me`).
   */
  @Put('me/payment-methods')
  async replacePaymentMethods(@Req() req: AuthenticatedRequest, @Body() body: ReplaceUserPaymentMethodsDto) {
    const paymentMethods = await this.usersService.replacePaymentMethods(
      req.user.id,
      body.paymentMethods.map((m) => ({ method: m.method, handle: m.handle })),
    );
    return { paymentMethods };
  }

  @Get('search')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async search(@Req() req: AuthenticatedRequest, @Query('q') q: string) {
    return this.usersService.search(req.user.id, q ?? '');
  }

  @Patch('me')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name?: string; currencyCode?: string; timezone?: string; language?: string; contributeCommunityPrices?: boolean; themeMode?: string; accentColor?: string | null; paymentMethod?: SettleMethod | null; paymentHandle?: string | null },
  ) {
    if (body.themeMode !== undefined && !THEME_MODES.includes(body.themeMode)) {
      throw new BadRequestException('Invalid themeMode');
    }
    if (body.accentColor !== undefined && body.accentColor !== null && !HEX_COLOR.test(body.accentColor)) {
      throw new BadRequestException('Invalid accentColor');
    }
    if (body.paymentMethod !== undefined && body.paymentMethod !== null && !PAYMENT_METHODS.includes(body.paymentMethod)) {
      throw new BadRequestException('Invalid paymentMethod');
    }
    if (body.paymentHandle !== undefined && body.paymentHandle !== null && !PAYMENT_HANDLE_REGEX.test(body.paymentHandle)) {
      throw new BadRequestException('Invalid paymentHandle');
    }
    const user = await this.usersService.update(req.user.id, body);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
      contributeCommunityPrices: user.contributeCommunityPrices,
      themeMode: user.themeMode,
      accentColor: user.accentColor,
      paymentMethod: user.paymentMethod,
      paymentHandle: user.paymentHandle,
    };
  }

  @Patch('me/ai-response-mode')
  async updateAiResponseMode(@Req() req: AuthenticatedRequest, @Body() body: { mode: string }) {
    await this.usersService.updateAiResponseMode(req.user.id, body.mode);
    return { success: true, mode: body.mode };
  }

  @Patch('me/ai-model')
  async updateAiModel(@Req() req: AuthenticatedRequest, @Body() body: { model: string }) {
    await this.usersService.updateAiModel(req.user.id, body.model);
    return { success: true, model: body.model };
  }

  @Patch('me/push-token')
  async updatePushToken(@Req() req: AuthenticatedRequest, @Body() body: { pushToken: string | null }) {
    await this.usersService.updatePushToken(req.user.id, body.pushToken);
    return { success: true };
  }

  @Get('me/notification-preferences')
  async getNotificationPreferences(@Req() req: AuthenticatedRequest) {
    return this.usersService.getNotificationPreferences(req.user.id);
  }

  @Patch('me/notification-preferences')
  async updateNotificationPreferences(
    @Req() req: AuthenticatedRequest,
    @Body() body: { budgetAlerts?: boolean; sharedAccountActivity?: boolean; debtReminders?: boolean; recurringExpenses?: boolean; subscriptionRenewals?: boolean; anomalyAlerts?: boolean; trackingGap?: boolean; purchaseRequests?: boolean; tripSettleUp?: boolean; shoppingReminders?: boolean; shoppingDeals?: boolean; inflationShield?: boolean },
  ) {
    return this.usersService.updateNotificationPreferences(req.user.id, body);
  }

  @Delete('me')
  async deleteAccount(@Req() req: AuthenticatedRequest) {
    await this.usersService.deactivate(req.user.id);
    return { success: true };
  }

  // ── Telegram ──

  @Post('me/telegram-link-code')
  @UseGuards(AccountContextGuard)
  async generateTelegramLinkCode(@Req() req: AuthenticatedRequest) {
    const result = await this.telegramLinkService.generateCode(req.user.id, req.accountId);
    return {
      code: result.code,
      expiresAt: result.expiresAt.toISOString(),
      botUsername: result.botUsername || this.telegramBotService.getBotUsername(),
    };
  }

  @Get('me/telegram-link')
  async getTelegramLinkStatus(@Req() req: AuthenticatedRequest) {
    const link = await this.telegramLinkService.getLinkByUserId(req.user.id);
    if (!link) {
      return { linked: false };
    }
    return {
      linked: true,
      telegramUsername: link.telegramUsername,
      linkedAt: link.createdAt.toISOString(),
    };
  }

  @Delete('me/telegram-link')
  async unlinkTelegram(@Req() req: AuthenticatedRequest) {
    await this.telegramLinkService.unlinkByUserId(req.user.id);
    return { success: true };
  }

  // ── WhatsApp ──

  @Post('me/whatsapp-link-code')
  @UseGuards(AccountContextGuard)
  async generateWhatsAppLinkCode(@Req() req: AuthenticatedRequest) {
    const result = await this.whatsAppLinkService.generateCode(req.user.id, req.accountId);
    return {
      code: result.code,
      expiresAt: result.expiresAt.toISOString(),
      waPhoneNumber: result.waPhoneNumber,
    };
  }

  @Get('me/whatsapp-link')
  async getWhatsAppLinkStatus(@Req() req: AuthenticatedRequest) {
    const link = await this.whatsAppLinkService.getLinkByUserId(req.user.id);
    if (!link) {
      return { linked: false };
    }
    return {
      linked: true,
      waPhoneNumber: link.waPhoneNumber,
      waProfileName: link.waProfileName,
      linkedAt: link.createdAt.toISOString(),
    };
  }

  @Delete('me/whatsapp-link')
  async unlinkWhatsApp(@Req() req: AuthenticatedRequest) {
    await this.whatsAppLinkService.unlinkByUserId(req.user.id);
    return { success: true };
  }

  // ── Slack ──

  @Post('me/slack-link-code')
  @UseGuards(AccountContextGuard)
  async generateSlackLinkCode(@Req() req: AuthenticatedRequest) {
    const result = await this.slackLinkService.generateCode(req.user.id, req.accountId);
    return { code: result.code, expiresAt: result.expiresAt.toISOString() };
  }

  @Get('me/slack-link')
  async getSlackLinkStatus(@Req() req: AuthenticatedRequest) {
    const link = await this.slackLinkService.getLinkByUserId(req.user.id);
    if (!link) return { linked: false };
    return {
      linked: true,
      slackProfileName: link.slackProfileName,
      linkedAt: link.createdAt.toISOString(),
    };
  }

  @Delete('me/slack-link')
  async unlinkSlack(@Req() req: AuthenticatedRequest) {
    await this.slackLinkService.unlinkByUserId(req.user.id);
    return { success: true };
  }
}

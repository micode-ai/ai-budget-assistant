import { Controller, Get, Header, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { verifyUnsubscribeToken } from './email-unsubscribe';
import { onboardingEmailCopy } from './onboarding-email-i18n';

function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Public, unauthenticated unsubscribe for the onboarding e-mail (ABA-738).
 *
 * GET is the link in the e-mail body; POST is RFC 8058 one-click, which mail clients
 * call from their own "Unsubscribe" button via the `List-Unsubscribe` header. Both are
 * idempotent and answer the same way whether or not the token is valid — a wrong or
 * missing token changes nothing and reveals nothing about whether the id exists.
 */
// Public and unauthenticated, so rate-limited per route (no APP_GUARD exists; a bare
// @Throttle would be inert). The HMAC already makes guessing infeasible; this caps abuse.
@Controller('mail/unsubscribe')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class MailUnsubscribeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribeLink(@Query('u') userId?: string, @Query('t') token?: string): Promise<string> {
    const lang = await this.unsubscribe(userId, token);
    const copy = onboardingEmailCopy(lang);
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(copy.unsubscribedTitle)}</title></head><body style="margin:0;background:#F8FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><div style="max-width:440px;margin:64px auto;padding:32px;background:#fff;border-radius:12px;text-align:center;"><h1 style="margin:0 0 12px;color:#1A1D26;font-size:20px;">${escapeHtml(copy.unsubscribedTitle)}</h1><p style="margin:0;color:#5E6272;font-size:15px;line-height:1.5;">${escapeHtml(copy.unsubscribedBody)}</p></div></body></html>`;
  }

  @Post()
  @HttpCode(200)
  async oneClick(@Query('u') userId?: string, @Query('t') token?: string): Promise<{ ok: true }> {
    await this.unsubscribe(userId, token);
    return { ok: true };
  }

  /** Turns the flag off when the token is valid; returns the user's language for the page. */
  private async unsubscribe(userId?: string, token?: string): Promise<string | null> {
    const secret = this.config.get<string>('JWT_SECRET') ?? '';
    if (!userId || !token || !verifyUnsubscribeToken(userId, token, secret)) return null;
    const rows = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { onboardingEmailsEnabled: false },
    });
    if (rows.count === 0) return null;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { language: true } });
    return user?.language ?? null;
  }
}

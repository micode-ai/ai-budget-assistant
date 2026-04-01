import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { TelegramService } from '../telegram/telegram.service';
import Stripe from 'stripe';
import * as crypto from 'crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_LENGTH = 6;
const BONUS_AI_REQUESTS = 30;

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly telegramService: TelegramService,
  ) {
    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(stripeKey || '', {
      apiVersion: '2026-02-25.clover',
    });
  }

  // ---- Code Generation ----

  private generateRandomCode(): string {
    const bytes = crypto.randomBytes(CODE_LENGTH);
    return Array.from(bytes)
      .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
      .join('');
  }

  async generateCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { referralCode: true },
    });

    if (user.referralCode) return user.referralCode;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateRandomCode();
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { referralCode: code },
        });
        return code;
      } catch (error: any) {
        if (error.code === 'P2002') continue;
        throw error;
      }
    }

    throw new Error('Failed to generate unique referral code after 5 attempts');
  }

  // ---- Apply Referral Code ----

  async applyReferralCode(referredUserId: string, code: string): Promise<void> {
    try {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true, name: true },
      });

      if (!referrer) {
        this.logger.warn(`Invalid referral code: ${code}`);
        return;
      }

      if (referrer.id === referredUserId) {
        this.logger.warn(`Self-referral attempt by user ${referredUserId}`);
        return;
      }

      await this.prisma.referral.create({
        data: {
          referrerUserId: referrer.id,
          referredUserId,
          code,
          status: 'pending',
        },
      });

      const subscription = await this.prisma.subscription.findUnique({
        where: { userId: referredUserId },
      });

      if (subscription?.trialEnd) {
        const extendedTrialEnd = new Date(subscription.trialEnd);
        extendedTrialEnd.setDate(extendedTrialEnd.getDate() + 7);
        await this.prisma.subscription.update({
          where: { userId: referredUserId },
          data: { trialEnd: extendedTrialEnd },
        });
      }

      const referred = await this.prisma.user.findUnique({
        where: { id: referredUserId },
        select: { name: true },
      });

      this.notificationsService.sendToUser(
        referrer.id,
        (lang: string) => lang === 'ru' ? 'Новый реферал!' : 'New Referral!',
        (lang: string) => lang === 'ru'
          ? `Ваш друг ${referred?.name || ''} присоединился по вашему коду!`
          : `Your friend ${referred?.name || ''} joined using your referral code!`,
      ).catch(() => {});

      this.telegramService.sendMessage(
        `🤝 New referral: ${referred?.name} joined via ${referrer.name}'s code (${code})`,
      ).catch(() => {});
    } catch (error: any) {
      if (error.code === 'P2002') {
        this.logger.warn(`User ${referredUserId} already has a referral`);
        return;
      }
      this.logger.error(`Failed to apply referral code: ${error.message}`);
    }
  }

  // ---- Qualification ----

  async qualifyPendingReferrals(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const pendingReferrals = await this.prisma.referral.findMany({
      where: {
        status: 'pending',
        createdAt: { lte: sevenDaysAgo },
      },
      include: {
        referred: { select: { id: true, name: true, isActive: true, lastSyncAt: true } },
        referrer: { select: { id: true, name: true, defaultAccountId: true } },
      },
    });

    for (const referral of pendingReferrals) {
      const isActive = referral.referred.isActive &&
        referral.referred.lastSyncAt &&
        referral.referred.lastSyncAt >= sevenDaysAgo;

      if (isActive) {
        await this.prisma.$transaction(async (tx) => {
          await tx.referral.update({
            where: { id: referral.id },
            data: { status: 'qualified', qualifiedAt: new Date() },
          });

          await this.grantReferralBonus(tx, referral.id, referral.referrer.id);
        });

        await this.checkMilestones(referral.referrer.id, referral.referrer.defaultAccountId);

        this.notificationsService.sendToUser(
          referral.referrer.id,
          (lang: string) => lang === 'ru' ? 'Реферал подтверждён!' : 'Referral Qualified!',
          (lang: string) => lang === 'ru'
            ? `Ваш реферал ${referral.referred.name} активен! Вы получили +${BONUS_AI_REQUESTS} AI запросов.`
            : `Your referral ${referral.referred.name} is now active! You earned +${BONUS_AI_REQUESTS} AI requests.`,
        ).catch(() => {});

        this.telegramService.sendMessage(
          `✅ Referral qualified: ${referral.referred.name} (referrer: ${referral.referrer.name}, +${BONUS_AI_REQUESTS} AI requests)`,
        ).catch(() => {});
      } else if (referral.createdAt <= thirtyDaysAgo) {
        await this.prisma.referral.update({
          where: { id: referral.id },
          data: { status: 'expired' },
        });
      }
    }
  }

  // ---- Bonus Granting ----

  private async grantReferralBonus(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    referralId: string,
    referrerUserId: string,
  ): Promise<void> {
    const referral = await tx.referral.findUniqueOrThrow({
      where: { id: referralId },
    });

    if (referral.bonusGranted) return;

    await tx.subscription.updateMany({
      where: { userId: referrerUserId },
      data: { bonusAiRequests: { increment: BONUS_AI_REQUESTS } },
    });

    await tx.referral.update({
      where: { id: referralId },
      data: { bonusGranted: true },
    });
  }

  // ---- Milestones ----

  async checkMilestones(referrerUserId: string, defaultAccountId?: string | null): Promise<void> {
    const qualifiedCount = await this.prisma.referral.count({
      where: { referrerUserId, status: 'qualified' },
    });

    if (qualifiedCount === 5) {
      await this.grantStripeCoupon(referrerUserId);
    }
  }

  private async grantStripeCoupon(userId: string): Promise<void> {
    const couponId = this.configService.get<string>('STRIPE_REFERRAL_COUPON_ID');
    if (!couponId) {
      this.logger.warn('STRIPE_REFERRAL_COUPON_ID not set, skipping coupon creation');
      return;
    }

    try {
      const promoCode = await this.stripe.promotionCodes.create({
        promotion: { type: 'coupon', coupon: couponId },
        max_redemptions: 1,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (user?.email) {
        await this.mailService.sendMail(
          user.email,
          '🎉 You earned a free month of Pro!',
          `<h2>Congratulations, ${user.name}!</h2>
          <p>You've referred 5 friends and earned a <strong>free month of Pro</strong>!</p>
          <p>Use this promotion code at checkout: <strong>${promoCode.code}</strong></p>
          <p>Keep sharing to earn the Ambassador badge at 10 referrals!</p>`,
        );
      }

      this.notificationsService.sendToUser(
        userId,
        (lang: string) => lang === 'ru' ? '5 рефералов!' : '5 Referrals!',
        (lang: string) => lang === 'ru'
          ? 'Вы заработали бесплатный месяц Pro! Проверьте email.'
          : 'You earned a free month of Pro! Check your email.',
      ).catch(() => {});
    } catch (error) {
      this.logger.error(`Failed to create Stripe coupon for user ${userId}: ${error}`);
    }
  }

  // ---- Stats & List ----

  async getStats(userId: string) {
    const code = await this.generateCode(userId);

    const [total, qualified, pending, subscription] = await Promise.all([
      this.prisma.referral.count({ where: { referrerUserId: userId } }),
      this.prisma.referral.count({ where: { referrerUserId: userId, status: 'qualified' } }),
      this.prisma.referral.count({ where: { referrerUserId: userId, status: 'pending' } }),
      this.prisma.subscription.findUnique({ where: { userId }, select: { bonusAiRequests: true } }),
    ]);

    let nextMilestone: { count: number; reward: string } | null = null;
    if (qualified < 5) {
      nextMilestone = { count: 5, reward: 'free_pro_month' };
    } else if (qualified < 10) {
      nextMilestone = { count: 10, reward: 'ambassador_badge' };
    }

    return {
      referralCode: code,
      totalReferrals: total,
      qualifiedReferrals: qualified,
      pendingReferrals: pending,
      bonusAiRequests: subscription?.bonusAiRequests ?? 0,
      nextMilestone,
    };
  }

  async getList(userId: string) {
    const referrals = await this.prisma.referral.findMany({
      where: { referrerUserId: userId },
      include: { referred: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return referrals.map((r) => ({
      id: r.id,
      referredName: r.referred.name,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
    }));
  }

  // ---- Admin ----

  async getAdminStats() {
    const [total, qualified, expired, pending] = await Promise.all([
      this.prisma.referral.count(),
      this.prisma.referral.count({ where: { status: 'qualified' } }),
      this.prisma.referral.count({ where: { status: 'expired' } }),
      this.prisma.referral.count({ where: { status: 'pending' } }),
    ]);

    const bonusResult = await this.prisma.subscription.aggregate({
      _sum: { bonusAiRequests: true },
    });

    const activeReferrers = await this.prisma.referral.groupBy({
      by: ['referrerUserId'],
      _count: true,
    });

    return {
      totalReferrals: total,
      qualifiedReferrals: qualified,
      expiredReferrals: expired,
      pendingReferrals: pending,
      qualifiedRate: total > 0 ? Math.round((qualified / total) * 100) : 0,
      totalBonusAiRequests: bonusResult._sum.bonusAiRequests ?? 0,
      activeReferrers: activeReferrers.length,
    };
  }

  async getAdminList(options: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = options;
    const where = status && status !== 'all' ? { status: status as any } : {};

    const [referrals, total] = await Promise.all([
      this.prisma.referral.findMany({
        where,
        include: {
          referrer: { select: { name: true, email: true } },
          referred: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.referral.count({ where }),
    ]);

    return {
      data: referrals.map((r) => ({
        id: r.id,
        referrerName: r.referrer.name,
        referrerEmail: r.referrer.email,
        referredName: r.referred.name,
        referredEmail: r.referred.email,
        code: r.code,
        status: r.status,
        bonusGranted: r.bonusGranted,
        createdAt: r.createdAt.toISOString(),
        qualifiedAt: r.qualifiedAt?.toISOString() ?? null,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}

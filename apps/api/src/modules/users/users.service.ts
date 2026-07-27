import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { SettleMethod } from '@budget/shared-types';

interface CreateUserData {
  email: string;
  passwordHash?: string;
  name: string;
  currencyCode?: string;
  timezone?: string;
  language?: string;
  googleId?: string;
  isVerified?: boolean;
  emailVerificationCode?: string;
  emailVerificationExpiresAt?: Date;
  contributeCommunityPrices?: boolean;
  themeMode?: string;
  accentColor?: string | null;
  paymentMethod?: SettleMethod | null;
  paymentHandle?: string | null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserData) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash ?? null,
        name: data.name,
        currencyCode: data.currencyCode || 'USD',
        timezone: data.timezone || 'UTC',
        language: data.language || 'en',
        googleId: data.googleId,
        isVerified: data.isVerified ?? false,
        emailVerificationCode: data.emailVerificationCode,
        emailVerificationExpiresAt: data.emailVerificationExpiresAt,
      },
    });
  }

  async search(callerId: string, query: string) {
    const q = query?.trim() ?? '';
    if (q.length < 2) return [];

    const users = await this.prisma.user.findMany({
      where: {
        id: { not: callerId },
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true },
      take: 20,
    });

    return users;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByGoogleId(googleId: string) {
    return this.prisma.user.findUnique({
      where: { googleId },
    });
  }

  async update(id: string, data: Partial<CreateUserData>) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updatePasswordReset(id: string, data: {
    passwordResetCode: string | null;
    passwordResetExpiresAt: Date | null;
    passwordHash?: string;
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updateEmailVerification(id: string, data: {
    isVerified?: boolean;
    emailVerificationCode: string | null;
    emailVerificationExpiresAt: Date | null;
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updateLastSync(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastSyncAt: new Date() },
    });
  }

  async updatePushToken(id: string, pushToken: string | null) {
    return this.prisma.user.update({
      where: { id },
      data: { pushToken },
    });
  }

  async getNotificationPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        notifyBudgetAlerts: true,
        notifySharedActivity: true,
        notifyDebtReminders: true,
        notifyRecurringExpenses: true,
        notifySubscriptionRenewals: true,
        notifyAnomalyAlerts: true,
        notifyTrackingGap: true,
        notifyPurchaseRequests: true,
        notifyTripSettleUp: true,
        notifyShoppingReminders: true,
        notifyShoppingDeals: true,
        notifyInflationShield: true,
      },
    });
    return {
      budgetAlerts: user?.notifyBudgetAlerts ?? true,
      sharedAccountActivity: user?.notifySharedActivity ?? true,
      debtReminders: user?.notifyDebtReminders ?? true,
      recurringExpenses: user?.notifyRecurringExpenses ?? true,
      subscriptionRenewals: user?.notifySubscriptionRenewals ?? true,
      anomalyAlerts: user?.notifyAnomalyAlerts ?? true,
      trackingGap: user?.notifyTrackingGap ?? true,
      purchaseRequests: user?.notifyPurchaseRequests ?? true,
      tripSettleUp: user?.notifyTripSettleUp ?? true,
      shoppingReminders: user?.notifyShoppingReminders ?? true,
      shoppingDeals: user?.notifyShoppingDeals ?? true,
      inflationShield: user?.notifyInflationShield ?? true,
    };
  }

  async updateNotificationPreferences(
    userId: string,
    prefs: { budgetAlerts?: boolean; sharedAccountActivity?: boolean; debtReminders?: boolean; recurringExpenses?: boolean; subscriptionRenewals?: boolean; anomalyAlerts?: boolean; trackingGap?: boolean; purchaseRequests?: boolean; tripSettleUp?: boolean; shoppingReminders?: boolean; shoppingDeals?: boolean; inflationShield?: boolean },
  ) {
    const data: Record<string, boolean> = {};
    if (prefs.budgetAlerts !== undefined) data.notifyBudgetAlerts = prefs.budgetAlerts;
    if (prefs.sharedAccountActivity !== undefined) data.notifySharedActivity = prefs.sharedAccountActivity;
    if (prefs.debtReminders !== undefined) data.notifyDebtReminders = prefs.debtReminders;
    if (prefs.recurringExpenses !== undefined) data.notifyRecurringExpenses = prefs.recurringExpenses;
    if (prefs.subscriptionRenewals !== undefined) data.notifySubscriptionRenewals = prefs.subscriptionRenewals;
    if (prefs.anomalyAlerts !== undefined) data.notifyAnomalyAlerts = prefs.anomalyAlerts;
    if (prefs.trackingGap !== undefined) data.notifyTrackingGap = prefs.trackingGap;
    if (prefs.purchaseRequests !== undefined) data.notifyPurchaseRequests = prefs.purchaseRequests;
    if (prefs.tripSettleUp !== undefined) data.notifyTripSettleUp = prefs.tripSettleUp;
    if (prefs.shoppingReminders !== undefined) data.notifyShoppingReminders = prefs.shoppingReminders;
    if (prefs.shoppingDeals !== undefined) data.notifyShoppingDeals = prefs.shoppingDeals;
    if (prefs.inflationShield !== undefined) data.notifyInflationShield = prefs.inflationShield;

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getNotificationPreferences(userId);
  }

  async updateAiResponseMode(userId: string, mode: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { aiResponseMode: mode },
    });
  }

  async updateAiModel(userId: string, model: string) {
    const validModels = ['fast', 'balanced', 'quality'];
    if (!validModels.includes(model)) {
      throw new BadRequestException(`Invalid AI model: ${model}. Must be one of: ${validModels.join(', ')}`);
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { aiModel: model },
    });
  }

  async updateEmailChange(id: string, data: {
    emailChangePending: string | null;
    emailChangeCode: string | null;
    emailChangeExpiresAt: Date | null;
    email?: string;
  }) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async deactivate(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}

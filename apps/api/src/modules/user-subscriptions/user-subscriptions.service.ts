import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateUserSubscriptionDto, UpdateUserSubscriptionDto } from './dto';

type UserSubscriptionRow = Prisma.UserSubscriptionGetPayload<object>;

@Injectable()
export class UserSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private computeMonthlyEquivalent(amount: number, billingCycle: string): number {
    switch (billingCycle) {
      case 'yearly':
        return amount / 12;
      case 'quarterly':
        return amount / 3;
      case 'weekly':
        return amount * (52 / 12);
      default:
        return amount;
    }
  }

  private computeDaysUntilRenewal(nextRenewalDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const renewal = new Date(nextRenewalDate);
    renewal.setHours(0, 0, 0, 0);
    return Math.round((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  private mapSubscription(sub: UserSubscriptionRow) {
    return {
      id: sub.id,
      accountId: sub.accountId,
      name: sub.name,
      amount: Number(sub.amount),
      currencyCode: sub.currencyCode,
      billingCycle: sub.billingCycle,
      nextRenewalDate: sub.nextRenewalDate instanceof Date
        ? sub.nextRenewalDate.toISOString().split('T')[0]
        : String(sub.nextRenewalDate),
      categoryId: sub.categoryId ?? null,
      notes: sub.notes ?? null,
      detectedFrom: sub.detectedFrom ?? null,
      isActive: sub.isActive,
      monthlyEquivalent: Math.round(this.computeMonthlyEquivalent(Number(sub.amount), sub.billingCycle) * 100) / 100,
      daysUntilRenewal: this.computeDaysUntilRenewal(sub.nextRenewalDate),
      createdAt: sub.createdAt instanceof Date ? sub.createdAt.toISOString() : String(sub.createdAt),
      updatedAt: sub.updatedAt instanceof Date ? sub.updatedAt.toISOString() : String(sub.updatedAt),
    };
  }

  async findAll(accountId: string) {
    const subs = await this.prisma.userSubscription.findMany({
      where: { accountId },
      orderBy: [{ isActive: 'desc' }, { nextRenewalDate: 'asc' }],
    });
    return subs.map((s) => this.mapSubscription(s));
  }

  async create(accountId: string, dto: CreateUserSubscriptionDto) {
    const sub = await this.prisma.userSubscription.create({
      data: {
        accountId,
        name: dto.name,
        amount: dto.amount,
        currencyCode: dto.currencyCode,
        billingCycle: dto.billingCycle,
        nextRenewalDate: new Date(dto.nextRenewalDate),
        categoryId: dto.categoryId ?? null,
        notes: dto.notes ?? null,
        detectedFrom: dto.detectedFrom ?? null,
      },
    });
    return this.mapSubscription(sub);
  }

  async update(accountId: string, id: string, dto: UpdateUserSubscriptionDto) {
    const existing = await this.prisma.userSubscription.findFirst({ where: { id, accountId } });
    if (!existing) throw new NotFoundException('Subscription not found');

    const data: Prisma.UserSubscriptionUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.currencyCode !== undefined) data.currencyCode = dto.currencyCode;
    if (dto.billingCycle !== undefined) data.billingCycle = dto.billingCycle;
    if (dto.nextRenewalDate !== undefined) data.nextRenewalDate = new Date(dto.nextRenewalDate);
    if ('categoryId' in dto) data.categoryId = dto.categoryId ?? null;
    if ('notes' in dto) data.notes = dto.notes ?? null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const sub = await this.prisma.userSubscription.update({ where: { id }, data });
    return this.mapSubscription(sub);
  }

  async remove(accountId: string, id: string) {
    const existing = await this.prisma.userSubscription.findFirst({ where: { id, accountId } });
    if (!existing) throw new NotFoundException('Subscription not found');
    await this.prisma.userSubscription.delete({ where: { id } });
    return { success: true };
  }
}

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FamilyFeedService } from '../family-feed/family-feed.service';
import type {
  CreatePurchaseRequestDto,
  UpdatePurchaseRequestDto,
  VotePurchaseRequestDto,
  PurchaseRequest,
  ApprovalRule,
} from '@budget/shared-types';

type VoteRow = { vote: string; userId: string };
type MemberRow = { userId: string; role: string };

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly familyFeed?: FamilyFeedService,
  ) {}

  // ─── pure helpers (accessible in tests via cast) ─────────────────────

  computeDecision(
    rule: string,
    votes: VoteRow[],
    totalMembers: number,
  ): 'APPROVED' | 'REJECTED' | null {
    const approveCount = votes.filter((v) => v.vote === 'APPROVE').length;
    const rejectCount = votes.filter((v) => v.vote === 'REJECT').length;
    const abstainCount = votes.filter((v) => v.vote === 'ABSTAIN').length;
    const effective = totalMembers - abstainCount;
    if (effective <= 0) return null;

    if (rule === 'MAJORITY') {
      if (approveCount / effective > 0.5) return 'APPROVED';
      if (rejectCount / effective > 0.5) return 'REJECTED';
    } else if (rule === 'UNANIMOUS') {
      if (rejectCount >= 1) return 'REJECTED';
      if (approveCount === effective) return 'APPROVED';
    }
    return null;
  }

  computeDecisionOwnerOnly(
    votes: VoteRow[],
    members: MemberRow[],
  ): 'APPROVED' | 'REJECTED' | null {
    const owner = members.find((m) => m.role === 'owner');
    if (!owner) return null;
    const ownerVote = votes.find((v) => v.userId === owner.userId);
    if (ownerVote?.vote === 'APPROVE') return 'APPROVED';
    if (ownerVote?.vote === 'REJECT') return 'REJECTED';
    return null;
  }

  // ─── CRUD ────────────────────────────────────────────────────────────

  async update(
    id: string,
    accountId: string,
    userId: string,
    userRole: string,
    dto: UpdatePurchaseRequestDto,
  ): Promise<PurchaseRequest> {
    const pr = await this.prisma.purchaseRequest.findFirst({ where: { id, accountId } });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (pr.status !== 'PENDING') throw new BadRequestException('Only pending requests can be edited');
    if (pr.createdByUserId !== userId && userRole !== 'owner') {
      throw new ForbiddenException('Only the creator or account owner can edit this request');
    }

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.merchant !== undefined && { merchant: dto.merchant }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
      },
      include: {
        createdBy: { select: { name: true } },
        votes: true,
      },
    });
    return this.toResponse(updated);
  }

  async create(
    accountId: string,
    userId: string,
    dto: CreatePurchaseRequestDto,
  ): Promise<PurchaseRequest> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { purchaseApprovalRule: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const pr = await this.prisma.purchaseRequest.create({
      data: {
        accountId,
        createdByUserId: userId,
        title: dto.title,
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency,
        categoryId: dto.categoryId,
        merchant: dto.merchant,
        imageUrl: dto.imageUrl,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        approvalRule: account.purchaseApprovalRule,
      },
      include: {
        createdBy: { select: { name: true } },
        votes: true,
      },
    });

    // Notify all account members except the creator
    void this.notifyMembers(accountId, userId, pr.title, 'purchase_request_created', pr.id);

    // fire-and-forget: record in family feed (non-personal accounts only)
    void this.familyFeed
      ?.recordEvent(pr.accountId, pr.createdByUserId, 'PURCHASE_REQUEST_CREATED', pr.id, {
        amount: Number(pr.amount),
        currency: pr.currency,
        title: pr.title,
      })
      .catch(() => {});

    return this.toResponse(pr);
  }

  async findAll(accountId: string, status?: string): Promise<PurchaseRequest[]> {
    const where: Record<string, unknown> = { accountId };
    if (status) where.status = status;
    const rows = await this.prisma.purchaseRequest.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        votes: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findOne(id: string, accountId: string): Promise<PurchaseRequest> {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, accountId },
      include: {
        createdBy: { select: { name: true } },
        votes: { include: { user: { select: { id: true, name: true } } } },
      },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    return this.toResponse(pr);
  }

  async vote(
    id: string,
    accountId: string,
    userId: string,
    dto: VotePurchaseRequestDto,
  ): Promise<PurchaseRequest> {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, accountId },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (pr.status !== 'PENDING') {
      throw new BadRequestException('Voting is closed for this request');
    }

    await this.prisma.purchaseRequestVote.upsert({
      where: { requestId_userId: { requestId: id, userId } },
      create: {
        requestId: id,
        userId,
        vote: dto.vote as any,
        comment: dto.comment,
      },
      update: {
        vote: dto.vote as any,
        comment: dto.comment,
      },
    });

    // Re-evaluate decision
    const allVotes = await this.prisma.purchaseRequestVote.findMany({
      where: { requestId: id },
    });
    const members = await this.prisma.accountMember.findMany({
      where: { accountId },
      select: { userId: true, role: true },
    });
    const totalMembers = members.length;

    let decision: 'APPROVED' | 'REJECTED' | null;
    if (pr.approvalRule === 'OWNER_ONLY') {
      decision = this.computeDecisionOwnerOnly(
        allVotes.map((v) => ({ vote: v.vote as string, userId: v.userId })),
        members,
      );
    } else {
      decision = this.computeDecision(
        pr.approvalRule as string,
        allVotes.map((v) => ({ vote: v.vote as string, userId: v.userId })),
        totalMembers,
      );
    }

    if (decision) {
      await this.prisma.purchaseRequest.update({
        where: { id },
        data: { status: decision as any },
      });
      if (decision === 'APPROVED') {
        void this.notifyMembers(accountId, null, pr.title, 'purchase_request_approved', id);
        void this.familyFeed
          ?.recordEvent(pr.accountId, pr.createdByUserId, 'PURCHASE_REQUEST_APPROVED', pr.id, {
            amount: Number(pr.amount),
            currency: pr.currency,
            title: pr.title,
          })
          .catch(() => {});
      } else {
        void this.notifications.sendToUser(
          pr.createdByUserId,
          (lang) => this.t(lang, 'purchase_request_rejected_title'),
          (_lang) => pr.title,
          { purchaseRequestId: id },
          'purchase_request_rejected',
        );
      }
    } else {
      // Notify creator of the new vote
      void this.notifications.sendToUser(
        pr.createdByUserId,
        (lang) => this.t(lang, 'purchase_request_voted_title'),
        (_lang) => pr.title,
        { purchaseRequestId: id },
        'purchase_request_voted',
      );
    }

    return this.findOne(id, accountId);
  }

  async convert(
    id: string,
    accountId: string,
    userId: string,
  ): Promise<{ expenseId: string }> {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, accountId },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (pr.status !== 'APPROVED') {
      throw new BadRequestException('Request must be APPROVED before converting');
    }
    if (pr.plannedExpenseId) {
      throw new BadRequestException('Already converted to a planned expense');
    }

    const expense = await this.prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          accountId,
          userId,
          clientId: `pr-convert-${id}`,
          amount: pr.amount,
          currencyCode: pr.currency,
          categoryId: pr.categoryId ?? undefined,
          merchant: pr.merchant ?? undefined,
          description: pr.title,
          date: new Date(),
          source: 'manual',
          isPlanned: true,
        },
      });
      await tx.purchaseRequest.update({
        where: { id },
        data: { plannedExpenseId: exp.id },
      });
      return exp;
    });

    return { expenseId: expense.id };
  }

  async markPurchased(id: string, accountId: string, userId: string): Promise<void> {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, accountId },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (!pr.plannedExpenseId) {
      throw new BadRequestException('No linked planned expense');
    }

    await this.prisma.$transaction([
      this.prisma.expense.update({
        where: { id: pr.plannedExpenseId },
        data: { isPlanned: false },
      }),
      this.prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'PURCHASED' as any },
      }),
    ]);

    // fire-and-forget: record in family feed (non-personal accounts only)
    void this.familyFeed
      ?.recordEvent(pr.accountId, userId, 'PURCHASE_REQUEST_PURCHASED', pr.id, {
        amount: Number(pr.amount),
        currency: pr.currency,
        title: pr.title,
      })
      .catch(() => {});
  }

  async cancel(
    id: string,
    accountId: string,
    userId: string,
    userRole: string,
  ): Promise<void> {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, accountId },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (pr.createdByUserId !== userId && userRole !== 'owner') {
      throw new ForbiddenException(
        'Only the creator or account owner can delete this request',
      );
    }

    if (pr.status === 'PENDING') {
      // Cancel pending → set REJECTED and record in family feed
      await this.prisma.purchaseRequest.update({
        where: { id },
        data: { status: 'REJECTED' as any },
      });
      void this.familyFeed
        ?.recordEvent(pr.accountId, pr.createdByUserId, 'PURCHASE_REQUEST_REJECTED', pr.id, {
          amount: Number(pr.amount),
          currency: pr.currency,
          title: pr.title,
        })
        .catch(() => {});
    } else {
      // History cleanup → hard delete
      await this.prisma.purchaseRequest.delete({ where: { id } });
    }
  }

  async updateApprovalRule(accountId: string, rule: ApprovalRule): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { purchaseApprovalRule: rule as any },
    });
  }

  async getPendingCount(accountId: string): Promise<number> {
    return this.prisma.purchaseRequest.count({
      where: { accountId, status: 'PENDING' as any },
    });
  }

  // ─── private helpers ─────────────────────────────────────────────────

  private async notifyMembers(
    accountId: string,
    excludeUserId: string | null,
    title: string,
    type: 'purchase_request_created' | 'purchase_request_approved',
    purchaseRequestId?: string,
  ): Promise<void> {
    const members = await this.prisma.accountMember.findMany({
      where: { accountId },
      select: { userId: true },
    });
    const data = purchaseRequestId ? { purchaseRequestId } : {};
    for (const { userId } of members) {
      if (userId === excludeUserId) continue;
      void this.notifications.sendToUser(
        userId,
        (lang) => this.t(lang, `${type}_title`),
        (_lang) => title,
        data,
        type,
      );
    }
  }

  private t(lang: string, key: string): string {
    const map: Record<string, Record<string, string>> = {
      purchase_request_created_title: {
        en: '🛒 New purchase request',
        pl: '🛒 Nowy wniosek o zakup',
        de: '🛒 Neue Kaufanfrage',
        ru: '🛒 Новый запрос на покупку',
        ua: '🛒 Новий запит на купівлю',
        fr: "🛒 Nouvelle demande d'achat",
        es: '🛒 Nueva solicitud de compra',
        be: '🛒 Новы запыт на куплю',
        nl: '🛒 Nieuw aankoopverzoek',
      },
      purchase_request_voted_title: {
        en: 'New vote on your request',
        pl: 'Nowy głos na Twój wniosek',
        de: 'Neue Abstimmung',
        ru: 'Новый голос за запрос',
        ua: 'Новий голос',
        fr: 'Nouveau vote',
        es: 'Nuevo voto',
        be: 'Новы голас',
        nl: 'Nieuwe stem',
      },
      purchase_request_approved_title: {
        en: '✅ Purchase request approved!',
        pl: '✅ Wniosek zatwierdzony!',
        de: '✅ Kaufanfrage genehmigt!',
        ru: '✅ Запрос одобрен!',
        ua: '✅ Запит схвалено!',
        fr: '✅ Demande approuvée!',
        es: '✅ ¡Solicitud aprobada!',
        be: '✅ Запыт адобраны!',
        nl: '✅ Aanvraag goedgekeurd!',
      },
      purchase_request_rejected_title: {
        en: '❌ Purchase request rejected',
        pl: '❌ Wniosek odrzucony',
        de: '❌ Kaufanfrage abgelehnt',
        ru: '❌ Запрос отклонён',
        ua: '❌ Запит відхилено',
        fr: '❌ Demande rejetée',
        es: '❌ Solicitud rechazada',
        be: '❌ Запыт адхілены',
        nl: '❌ Aanvraag afgewezen',
      },
    };
    return map[key]?.[lang] ?? map[key]?.['en'] ?? key;
  }

  private toResponse(pr: any): PurchaseRequest {
    return {
      id: pr.id,
      accountId: pr.accountId,
      createdByUserId: pr.createdByUserId,
      createdByUserName: pr.createdBy?.name,
      title: pr.title,
      description: pr.description ?? undefined,
      amount: Number(pr.amount),
      currency: pr.currency,
      categoryId: pr.categoryId ?? undefined,
      merchant: pr.merchant ?? undefined,
      imageUrl: pr.imageUrl ?? undefined,
      status: pr.status,
      approvalRule: pr.approvalRule,
      plannedExpenseId: pr.plannedExpenseId ?? undefined,
      expiresAt: pr.expiresAt?.toISOString(),
      createdAt: pr.createdAt.toISOString(),
      updatedAt: pr.updatedAt.toISOString(),
      votes: pr.votes?.map((v: any) => ({
        id: v.id,
        requestId: v.requestId,
        userId: v.userId,
        userName: v.user?.name ?? '',
        vote: v.vote,
        comment: v.comment ?? undefined,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  }
}

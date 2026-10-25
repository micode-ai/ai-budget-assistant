import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { validateSettlement } from './group-ledger';
import { CreateGroupSettlementDto } from './dto';
import type { GroupLedgerPorts } from './group-ledger-ports';
import { isP2002 } from './group-util';
import type { GroupDetail } from '@budget/shared-types';

/**
 * Recording and voiding a payment between two members (ABA-652). Built by GroupsService, which stays
 * the facade the controllers inject, and handed the ledger primitives it owns through `groups`.
 */
export class GroupSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupLedgerPorts,
  ) {}

  async create(groupId: string, memberId: string, dto: CreateGroupSettlementDto): Promise<GroupDetail> {
    const actor = await this.groups.resolveActor(groupId, memberId);

    const dup = await this.prisma.groupSettlement.findFirst({
      where: { groupId, clientRequestId: dto.clientRequestId },
      select: { id: true },
    });
    if (dup) return this.groups.getDetail(groupId, actor.id);

    if (dto.fromMemberId === dto.toMemberId) throw new BadRequestException('from and to must differ');
    if (actor.id !== dto.fromMemberId && actor.id !== dto.toMemberId) {
      throw new ForbiddenException('You can only settle a transfer you are part of');
    }
    await this.groups.assertLiveMembers(groupId, [dto.fromMemberId, dto.toMemberId]);

    const group = await this.prisma.expenseGroup.findUnique({
      where: { id: groupId },
      select: { ledgerVersion: true },
    });
    if (!group) throw new NotFoundException('Group not found');
    if (group.ledgerVersion !== dto.ledgerVersion) {
      throw new ConflictException({ code: 'LEDGER_CHANGED', message: 'Balances changed, refresh and retry' });
    }

    // ABA-652: validated against the CURRENT balances before any write. A payment may be partial or
    // go to a creditor who is not the suggested one, but it can only shrink both balances, never
    // flip a sign, so nobody can record "I paid 1000" to become a creditor.
    const { ledger } = await this.groups.loadState(groupId);
    const check = validateSettlement(dto, ledger.balances);
    if (!check.ok) {
      throw new BadRequestException({
        code: 'SETTLEMENT_EXCEEDS_BALANCE',
        reason: check.reason,
        message: 'That payment is larger than what is owed between these two members',
      });
    }

    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const cas = await tx.expenseGroup.updateMany({
          where: { id: groupId, ledgerVersion: dto.ledgerVersion },
          data: { ledgerVersion: { increment: 1 } },
        });
        if (cas.count === 0) {
          throw new ConflictException({ code: 'LEDGER_CHANGED', message: 'Balances changed, refresh and retry' });
        }
        // The CAS above holds the group row's lock: re-check, on what it protects, that the group is
        // still active and both parties are still live (a merge or removal may have run first).
        const locked = await tx.expenseGroup.findUnique({ where: { id: groupId }, select: { status: true } });
        if (!locked || locked.status !== 'active') {
          throw new ForbiddenException({ code: 'GROUP_ARCHIVED', message: 'This group is archived and read-only' });
        }
        await this.groups.assertLiveMembers(groupId, [dto.fromMemberId, dto.toMemberId], tx);
        await tx.groupSettlement.create({
          data: {
            groupId,
            fromMemberId: dto.fromMemberId,
            toMemberId: dto.toMemberId,
            // Clamped to min(owed, owed-to): the cent of tolerance never flips a sign.
            amount: check.amount,
            method: dto.method ?? null,
            recordedByMemberId: actor.id,
            clientRequestId: dto.clientRequestId,
          },
        });
      });
    } catch (e) {
      if (isP2002(e)) return this.groups.getDetail(groupId, actor.id);
      throw e;
    }
    this.groups.notifyActivity(groupId, actor.id);
    this.groups.afterLedgerWrite(groupId);
    return this.groups.getDetail(groupId, actor.id);
  }

  async void(groupId: string, memberId: string, settlementId: string): Promise<GroupDetail> {
    const actor = await this.groups.resolveActor(groupId, memberId);
    const s = await this.prisma.groupSettlement.findFirst({
      where: { id: settlementId, groupId, voidedAt: null },
      select: { id: true, recordedByMemberId: true, toMemberId: true },
    });
    if (!s) throw new NotFoundException('Settlement not found');
    if (!actor.isOwner && s.recordedByMemberId !== actor.id && s.toMemberId !== actor.id) {
      throw new ForbiddenException('Only the recorder, the receiver or the owner can void this payment');
    }
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await this.groups.lockGroup(tx, groupId);
      await tx.groupSettlement.update({
        where: { id: s.id },
        data: { voidedAt: new Date(), voidedByMemberId: actor.id },
      });
    });
    this.groups.afterLedgerWrite(groupId);
    return this.groups.getDetail(groupId, actor.id);
  }
}

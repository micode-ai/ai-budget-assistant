import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

/**
 * DI-based guard that blocks mutations on archived trip accounts.
 * Reads req.accountId (set by AccountContextGuard, existing) and checks
 * Account.tripStatus. Non-trip accounts (tripStatus is null) are always allowed.
 * Use as: @UseGuards(TripArchivedGuard) — needs PrismaService injected.
 */
@Injectable()
export class TripArchivedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const account = await this.prisma.account.findUnique({
      where: { id: request.accountId },
      select: { tripStatus: true },
    });
    if (account?.tripStatus === 'archived') {
      throw new ForbiddenException('This trip is archived and can no longer be modified');
    }
    return true;
  }
}

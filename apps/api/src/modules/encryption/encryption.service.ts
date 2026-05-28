import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  SetupEncryptionDto,
  EnableAccountEncryptionDto,
  GrantKeyDto,
  RotateAccountKeyDto,
  SetupRecoveryDto,
  RecoverEncryptionDto,
} from './dto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly recoveryAttempts = new Map<string, number[]>();

  constructor(private readonly prisma: PrismaService) {}

  private checkRecoveryRateLimit(email: string): void {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const attempts = (this.recoveryAttempts.get(email) || []).filter((t) => now - t < windowMs);
    if (attempts.length >= 5) {
      throw new HttpException('Too many recovery attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    attempts.push(now);
    this.recoveryAttempts.set(email, attempts);
  }

  async setupEncryption(userId: string, dto: SetupEncryptionDto) {
    return this.prisma.userEncryptionProfile.upsert({
      where: { userId },
      create: {
        userId,
        pbkdf2Salt: dto.pbkdf2Salt,
        publicKeyX25519: dto.publicKeyX25519,
        publicKeyEd25519: dto.publicKeyEd25519,
        wrappedPrivateKeyX25519: dto.wrappedPrivateKeyX25519,
        wrappedPrivateKeyEd25519: dto.wrappedPrivateKeyEd25519,
      },
      update: {
        pbkdf2Salt: dto.pbkdf2Salt,
        publicKeyX25519: dto.publicKeyX25519,
        publicKeyEd25519: dto.publicKeyEd25519,
        wrappedPrivateKeyX25519: dto.wrappedPrivateKeyX25519,
        wrappedPrivateKeyEd25519: dto.wrappedPrivateKeyEd25519,
        keyVersion: { increment: 1 },
      },
    });
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.userEncryptionProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Encryption profile not found');
    }

    return {
      id: profile.id,
      pbkdf2Salt: profile.pbkdf2Salt,
      publicKeyX25519: profile.publicKeyX25519,
      publicKeyEd25519: profile.publicKeyEd25519,
      wrappedPrivateKeyX25519: profile.wrappedPrivateKeyX25519,
      wrappedPrivateKeyEd25519: profile.wrappedPrivateKeyEd25519,
      keyVersion: profile.keyVersion,
      recoveryConfigured: !!profile.recoveryKeyHash,
    };
  }

  async enableAccountEncryption(
    accountId: string,
    userId: string,
    dto: EnableAccountEncryptionDto,
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      const updatedAccount = await tx.account.update({
        where: { id: accountId },
        data: {
          encryptionEnabled: true,
          encryptionTier: dto.tier,
        },
      });

      await tx.accountEncryptionKey.upsert({
        where: { accountId_userId: { accountId, userId } },
        create: {
          accountId,
          userId,
          wrappedAccountKey: dto.wrappedAccountKey,
          wrappedBy: userId,
          wrappingMethod: 'master_key',
        },
        update: {
          wrappedAccountKey: dto.wrappedAccountKey,
          wrappedBy: userId,
          wrappingMethod: 'master_key',
        },
      });

      return updatedAccount;
    });
  }

  async getAccountKey(accountId: string, userId: string) {
    const key = await this.prisma.accountEncryptionKey.findUnique({
      where: { accountId_userId: { accountId, userId } },
    });

    if (!key) {
      throw new NotFoundException('Account encryption key not found for this user');
    }

    return key;
  }

  async getAccountEncryptionStatus(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        encryptionEnabled: true,
        encryptionTier: true,
        keyRotationNeeded: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // Get the current key version from the latest encryption key
    let keyVersion = 0;
    if (account.encryptionEnabled) {
      const latestKey = await this.prisma.accountEncryptionKey.findFirst({
        where: { accountId },
        orderBy: { keyVersion: 'desc' },
        select: { keyVersion: true },
      });
      keyVersion = latestKey?.keyVersion ?? 0;
    }

    return {
      encryptionEnabled: account.encryptionEnabled,
      encryptionTier: account.encryptionTier,
      keyVersion,
      keyRotationNeeded: account.keyRotationNeeded,
    };
  }

  async grantKey(accountId: string, userId: string, dto: GrantKeyDto) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (!account.encryptionEnabled) {
      throw new BadRequestException('Encryption is not enabled for this account');
    }

    // Verify target user is a member of the account
    const membership = await this.prisma.accountMember.findUnique({
      where: { accountId_userId: { accountId, userId: dto.targetUserId } },
    });

    if (!membership) {
      throw new BadRequestException('Target user is not a member of this account');
    }

    // Check if key already exists
    const existingKey = await this.prisma.accountEncryptionKey.findUnique({
      where: { accountId_userId: { accountId, userId: dto.targetUserId } },
    });

    if (existingKey) {
      throw new ConflictException('Encryption key already exists for this user');
    }

    // Get current key version
    const latestKey = await this.prisma.accountEncryptionKey.findFirst({
      where: { accountId },
      orderBy: { keyVersion: 'desc' },
      select: { keyVersion: true },
    });

    return this.prisma.accountEncryptionKey.create({
      data: {
        accountId,
        userId: dto.targetUserId,
        wrappedAccountKey: dto.wrappedAccountKey,
        wrappedBy: userId,
        wrappingMethod: dto.wrappingMethod,
        keyVersion: latestKey?.keyVersion ?? 1,
      },
    });
  }

  async getPendingGrants(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (!account.encryptionEnabled) {
      throw new BadRequestException('Encryption is not enabled for this account');
    }

    // Find members who don't have encryption keys yet
    const members = await this.prisma.accountMember.findMany({
      where: { accountId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            encryptionProfile: {
              select: {
                publicKeyX25519: true,
              },
            },
          },
        },
      },
    });

    const existingKeys = await this.prisma.accountEncryptionKey.findMany({
      where: { accountId },
      select: { userId: true },
    });

    const usersWithKeys = new Set(existingKeys.map((k) => k.userId));

    return members
      .filter((m) => !usersWithKeys.has(m.userId))
      .map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        publicKeyX25519: m.user.encryptionProfile?.publicKeyX25519 ?? null,
        hasEncryptionProfile: !!m.user.encryptionProfile,
      }));
  }

  async rotateAccountKey(
    accountId: string,
    userId: string,
    dto: RotateAccountKeyDto,
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (!account.encryptionEnabled) {
      throw new BadRequestException('Encryption is not enabled for this account');
    }

    // Get current key version
    const latestKey = await this.prisma.accountEncryptionKey.findFirst({
      where: { accountId },
      orderBy: { keyVersion: 'desc' },
      select: { keyVersion: true },
    });

    const newKeyVersion = (latestKey?.keyVersion ?? 0) + 1;

    return this.prisma.$transaction(async (tx: PrismaClient) => {
      // Update all wrapped keys
      for (const entry of dto.wrappedKeys) {
        await tx.accountEncryptionKey.upsert({
          where: { accountId_userId: { accountId, userId: entry.userId } },
          update: {
            wrappedAccountKey: entry.wrappedAccountKey,
            wrappedBy: userId,
            keyVersion: newKeyVersion,
          },
          create: {
            accountId,
            userId: entry.userId,
            wrappedAccountKey: entry.wrappedAccountKey,
            wrappedBy: userId,
            wrappingMethod: 'public_key',
            keyVersion: newKeyVersion,
          },
        });
      }

      // Set keyRotationNeeded to false
      await tx.account.update({
        where: { id: accountId },
        data: { keyRotationNeeded: false },
      });

      return { keyVersion: newKeyVersion };
    });
  }

  async getMemberPublicKeys(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const members = await this.prisma.accountMember.findMany({
      where: { accountId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            encryptionProfile: {
              select: {
                publicKeyX25519: true,
              },
            },
          },
        },
      },
    });

    return members
      .filter((m) => !!m.user.encryptionProfile)
      .map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        publicKeyX25519: m.user.encryptionProfile!.publicKeyX25519,
      }));
  }

  async setupRecovery(userId: string, dto: SetupRecoveryDto) {
    const profile = await this.prisma.userEncryptionProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Encryption profile not found');
    }

    const recoveryKeyHash = await bcrypt.hash(dto.recoveryKeyPlaintext, 12);

    return this.prisma.userEncryptionProfile.update({
      where: { userId },
      data: {
        recoveryKeyHash,
        wrappedMasterKeyByRecovery: dto.wrappedMasterKeyByRecovery,
      },
    });
  }

  async resetProfile(userId: string) {
    const profile = await this.prisma.userEncryptionProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return { deleted: false };
    }

    await this.prisma.userEncryptionProfile.delete({
      where: { userId },
    });

    return { deleted: true };
  }

  async recover(dto: RecoverEncryptionDto) {
    this.checkRecoveryRateLimit(dto.email);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile = await this.prisma.userEncryptionProfile.findUnique({
      where: { userId: user.id },
    });

    if (!profile) {
      throw new NotFoundException('Encryption profile not found');
    }

    if (!profile.recoveryKeyHash || !profile.wrappedMasterKeyByRecovery) {
      throw new BadRequestException('Recovery has not been set up for this account');
    }

    const isValid = await bcrypt.compare(dto.recoveryKey, profile.recoveryKeyHash);

    if (!isValid) {
      throw new BadRequestException('Invalid recovery key');
    }

    return {
      pbkdf2Salt: profile.pbkdf2Salt,
      publicKeyX25519: profile.publicKeyX25519,
      publicKeyEd25519: profile.publicKeyEd25519,
      wrappedPrivateKeyX25519: profile.wrappedPrivateKeyX25519,
      wrappedPrivateKeyEd25519: profile.wrappedPrivateKeyEd25519,
      wrappedMasterKeyByRecovery: profile.wrappedMasterKeyByRecovery,
      keyVersion: profile.keyVersion,
    };
  }
}

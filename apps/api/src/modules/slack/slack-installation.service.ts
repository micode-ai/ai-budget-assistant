import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { encryptToken, decryptToken } from './helpers/token-crypto';

export interface UpsertInstallationInput {
  teamId: string;
  teamName?: string;
  botTokenPlain: string;
  botUserId: string;
  appId?: string;
  enterpriseId?: string;
  scope?: string;
  installedBySlackUserId?: string;
}

@Injectable()
export class SlackInstallationService {
  private readonly logger = new Logger(SlackInstallationService.name);
  private readonly encKey: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.encKey = config.get<string>('SLACK_TOKEN_ENC_KEY') || '';
  }

  async upsert(input: UpsertInstallationInput): Promise<void> {
    const botToken = encryptToken(input.botTokenPlain, this.encKey);
    const data = {
      teamName: input.teamName ?? null,
      botToken,
      botUserId: input.botUserId,
      appId: input.appId ?? null,
      enterpriseId: input.enterpriseId ?? null,
      scope: input.scope ?? null,
      installedBySlackUserId: input.installedBySlackUserId ?? null,
    };
    await this.prisma.slackInstallation.upsert({
      where: { teamId: input.teamId },
      create: { teamId: input.teamId, ...data },
      update: data,
    });
    this.logger.log(`Slack installed for team ${input.teamId} (${input.teamName ?? ''})`);
  }

  /** Decrypted bot token for a team, or null if no installation / decrypt failed. */
  async getToken(teamId: string): Promise<string | null> {
    const row = await this.prisma.slackInstallation.findUnique({ where: { teamId } });
    if (!row) return null;
    const token = decryptToken(row.botToken, this.encKey);
    if (!token) {
      this.logger.error(`Failed to decrypt bot token for team ${teamId}`);
      return null;
    }
    return token;
  }

  async getBotUserId(teamId: string): Promise<string | null> {
    const row = await this.prisma.slackInstallation.findUnique({
      where: { teamId },
      select: { botUserId: true },
    });
    return row?.botUserId ?? null;
  }
}

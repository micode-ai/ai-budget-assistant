import { Controller, Get, Inject, Logger, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { SlackOAuthService } from './slack-oauth.service';
import { SlackInstallationService } from './slack-installation.service';
import { SLACK_REDIS } from './types';
import { successPage, errorPage, notConfiguredPage } from './helpers/oauth-pages';

@Controller('slack')
export class SlackOAuthController {
  private readonly logger = new Logger(SlackOAuthController.name);

  constructor(
    private readonly oauth: SlackOAuthService,
    private readonly installations: SlackInstallationService,
    @Inject(SLACK_REDIS) private readonly redis: Redis,
  ) {}

  @Get('install')
  async install(@Res() res: Response): Promise<void> {
    if (!this.oauth.isConfigured()) {
      res.status(503).send(notConfiguredPage());
      return;
    }
    const state = randomBytes(16).toString('hex');
    await this.redis.set(`slack:oauth_state:${state}`, '1', 'EX', 600, 'NX');
    res.redirect(this.oauth.buildAuthorizeUrl(state));
  }

  @Get('oauth/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (error) {
      res.status(400).send(errorPage('Installation was cancelled.'));
      return;
    }
    if (!code || !state) {
      res.status(400).send(errorPage('Missing authorization code or state.'));
      return;
    }
    const existed = await this.redis.del(`slack:oauth_state:${state}`);
    if (existed !== 1) {
      res.status(400).send(errorPage('Invalid or expired link. Please start the installation again.'));
      return;
    }
    try {
      const r = await this.oauth.exchangeCode(code);
      if (!r.teamId || !r.botToken || !r.botUserId) {
        throw new Error('Incomplete OAuth response from Slack');
      }
      await this.installations.upsert({
        teamId: r.teamId,
        teamName: r.teamName,
        botTokenPlain: r.botToken,
        botUserId: r.botUserId,
        appId: r.appId,
        enterpriseId: r.enterpriseId,
        scope: r.scope,
        installedBySlackUserId: r.installedBySlackUserId,
      });
      res.status(200).send(successPage(r.teamName));
    } catch (err) {
      this.logger.error(`OAuth callback failed: ${err instanceof Error ? err.stack || err.message : err}`);
      res.status(500).send(errorPage('Something went wrong installing the app. Please try again.'));
    }
  }
}

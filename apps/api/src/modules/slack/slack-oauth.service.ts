import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';

export interface SlackOAuthResult {
  teamId: string;
  teamName?: string;
  botToken: string;
  botUserId: string;
  appId?: string;
  enterpriseId?: string;
  scope?: string;
  installedBySlackUserId?: string;
}

const SCOPES = 'chat:write,im:history,im:read,im:write,files:read';

@Injectable()
export class SlackOAuthService {
  private readonly logger = new Logger(SlackOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUrl: string;
  private readonly client = new WebClient();

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('SLACK_CLIENT_ID') || '';
    this.clientSecret = config.get<string>('SLACK_CLIENT_SECRET') || '';
    this.redirectUrl = config.get<string>('SLACK_OAUTH_REDIRECT_URL') || '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUrl);
  }

  buildAuthorizeUrl(state: string): string {
    const p = new URLSearchParams({
      client_id: this.clientId,
      scope: SCOPES,
      state,
      redirect_uri: this.redirectUrl,
    });
    return `https://slack.com/oauth/v2/authorize?${p.toString()}`;
  }

  async exchangeCode(code: string): Promise<SlackOAuthResult> {
    const res = (await this.client.oauth.v2.access({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: this.redirectUrl,
    })) as {
      access_token?: string;
      bot_user_id?: string;
      app_id?: string;
      scope?: string;
      team?: { id?: string; name?: string };
      authed_user?: { id?: string };
      enterprise?: { id?: string } | null;
    };
    return {
      teamId: res.team?.id ?? '',
      teamName: res.team?.name,
      botToken: res.access_token ?? '',
      botUserId: res.bot_user_id ?? '',
      appId: res.app_id,
      enterpriseId: res.enterprise?.id,
      scope: res.scope,
      installedBySlackUserId: res.authed_user?.id,
    };
  }
}

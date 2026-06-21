import { Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();
  private readonly audiences: string[];

  constructor(private readonly configService: ConfigService) {
    this.audiences = (this.configService.get<string>('GOOGLE_OAUTH_CLIENT_IDS') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async verify(idToken: string): Promise<TokenPayload> {
    if (this.audiences.length === 0) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    let ticket;
    try {
      ticket = await this.client.verifyIdToken({ idToken, audience: this.audiences });
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Invalid Google token');
    }
    return payload;
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { LastActiveService } from '../../users/last-active.service';
import { tokenVersionMatches } from '../token-version.util';

interface JwtPayload {
  sub: string;
  email: string;
  /** The user's tokenVersion when issued; absent on tokens from before ABA-809. */
  tv?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly lastActive: LastActiveService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findById(payload.sub);

    // A password reset or an e-mail change bumps tokenVersion and so ends every older session (ABA-809).
    if (!user || !user.isActive || !tokenVersionMatches(payload, user)) {
      throw new UnauthorizedException();
    }

    // Any authenticated request counts as activity. Throttled inside the service
    // and fire-and-forget so it can neither delay nor fail the request.
    void this.lastActive.touch(user.id).catch(() => undefined);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      currencyCode: user.currencyCode,
      timezone: user.timezone,
      defaultAccountId: user.defaultAccountId,
    };
  }
}

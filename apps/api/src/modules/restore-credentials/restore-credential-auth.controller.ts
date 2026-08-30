import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RestoreCredentialsService } from './restore-credentials.service';
import { VerifyRestoreAuthenticationDto } from './dto';

/**
 * Deliberately a separate controller from the registration one: this ceremony
 * cannot be authenticated — the caller is a freshly restored device with no
 * token — so keeping it apart means a public route can never inherit a guard
 * and, far worse, a guarded route can never quietly lose one.
 */
@Controller('auth/restore')
export class RestoreCredentialAuthController {
  constructor(private readonly service: RestoreCredentialsService) {}

  @Get('options')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  getOptions() {
    return this.service.getAuthenticationOptions();
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Body() dto: VerifyRestoreAuthenticationDto) {
    return this.service.verifyAuthentication(dto.response);
  }
}

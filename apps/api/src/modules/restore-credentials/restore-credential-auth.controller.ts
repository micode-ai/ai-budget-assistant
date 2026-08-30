import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { RestoreCredentialsService } from './restore-credentials.service';
import { VerifyRestoreAuthenticationDto } from './dto';

/**
 * Deliberately a separate controller from the registration one: this ceremony
 * cannot be authenticated — the caller is a freshly restored device with no
 * token — so keeping it apart means a public route can never inherit a guard
 * and, far worse, a guarded route can never quietly lose one.
 *
 * `@Throttle` is inert without `ThrottlerGuard` — this app registers no
 * global throttler guard (`ThrottlerModule.forRootAsync` in app.module.ts
 * supplies only options/storage), so every route that wants the limit to
 * actually apply must pair `@UseGuards(ThrottlerGuard)` with `@Throttle`
 * itself, same as `import-bank.controller.ts` / `guest.controller.ts`.
 */
@Controller('auth/restore')
export class RestoreCredentialAuthController {
  constructor(private readonly service: RestoreCredentialsService) {}

  @Get('options')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  getOptions() {
    return this.service.getAuthenticationOptions();
  }

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verify(@Body() dto: VerifyRestoreAuthenticationDto) {
    return this.service.verifyAuthentication(dto.response);
  }
}

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuthService } from '../auth/auth.service';
import {
  resolveRestoreCredentialConfig,
  type RestoreCredentialConfig,
} from './restore-credential.config';

const CHALLENGE_TTL_SEC = 300;
const regKey = (userId: string) => `restorecred:reg:${userId}`;

@Injectable()
export class RestoreCredentialsService {
  private readonly logger = new Logger(RestoreCredentialsService.name);
  private readonly config: RestoreCredentialConfig | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    // Not yet called from this file — Task 5 (the authentication ceremony)
    // is what mints a session from a verified restore credential.
    private readonly auth: AuthService,
  ) {
    try {
      this.config = resolveRestoreCredentialConfig(process.env);
    } catch (err) {
      // Fail closed on the FEATURE, not on the API: an unset
      // RESTORE_CREDENTIAL_CERT_FINGERPRINTS must not stop the whole app from
      // booting (production's first deploy, every dev machine without the
      // var). Every method that actually needs the config guards on it below.
      this.logger.warn(
        `Restore credentials disabled: ${(err as Error).message}`,
      );
      this.config = null;
    }
  }

  private requireConfig(): RestoreCredentialConfig {
    if (!this.config) {
      throw new ServiceUnavailableException('Restore credentials are not configured');
    }
    return this.config;
  }

  async getRegistrationOptions(userId: string, email: string) {
    const config = this.requireConfig();

    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpId,
      userID: Buffer.from(userId, 'utf8'),
      userName: email,
      // Trust comes from the origin <-> assetlinks binding, not from the
      // provenance of a system-managed authenticator.
      attestationType: 'none',
      // There is no human present during a restore, so demanding user
      // verification would make the credential unusable for its only purpose.
      authenticatorSelection: { residentKey: 'required', userVerification: 'discouraged' },
      supportedAlgorithmIDs: [-7, -257],
    });

    await this.cache.set(regKey(userId), options.challenge, CHALLENGE_TTL_SEC);
    return options;
  }

  async verifyRegistration(userId: string, response: RegistrationResponseJSON) {
    const config = this.requireConfig();

    const expectedChallenge = await this.cache.get<string>(regKey(userId));
    if (!expectedChallenge) {
      throw new UnauthorizedException('No pending restore-credential registration');
    }

    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpId,
      requireUserVerification: false,
    });

    if (!result.verified || !result.registrationInfo) {
      throw new UnauthorizedException('Restore credential failed verification');
    }

    const { credential } = result.registrationInfo;
    await this.prisma.restoreCredential.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
      },
    });

    await this.cache.del(regKey(userId));
    return { ok: true as const };
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.prisma.restoreCredential.deleteMany({ where: { userId } });
  }
}

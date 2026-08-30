import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { PrismaService } from '../../database/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuthService } from '../auth/auth.service';
import {
  resolveRestoreCredentialConfig,
  type RestoreCredentialConfig,
} from './restore-credential.config';

const CHALLENGE_TTL_SEC = 300;
const regKey = (userId: string) => `restorecred:reg:${userId}`;
const authKey = (challenge: string) => `restorecred:auth:${challenge}`;

@Injectable()
export class RestoreCredentialsService {
  private readonly logger = new Logger(RestoreCredentialsService.name);
  private readonly config: RestoreCredentialConfig | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    // Used by verifyAuthentication to mint a session from a verified restore
    // credential.
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

  async getAuthenticationOptions() {
    const config = this.requireConfig();

    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      // Empty on purpose: the caller has no session yet, so we cannot know
      // which credentials to allow. The credential id in the assertion tells us.
      allowCredentials: [],
      userVerification: 'discouraged',
    });

    await this.cache.set(authKey(options.challenge), '1', CHALLENGE_TTL_SEC);
    return options;
  }

  async verifyAuthentication(response: AuthenticationResponseJSON) {
    const config = this.requireConfig();

    const challenge = this.readChallenge(response);
    const issued = await this.cache.get<string>(authKey(challenge));
    if (!issued) {
      throw new UnauthorizedException('Unknown or expired restore challenge');
    }
    // Consume before verifying so a replay cannot race a slow signature check.
    await this.cache.del(authKey(challenge));

    const stored = await this.prisma.restoreCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!stored) {
      throw new UnauthorizedException('Unknown restore credential');
    }

    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpId,
      requireUserVerification: false,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports as AuthenticatorTransportFuture[],
      },
    });

    if (!result.verified) {
      throw new UnauthorizedException('Restore credential failed verification');
    }

    const newCounter = result.authenticationInfo.newCounter;
    // A zero counter means "doesn't report counts", not "went backwards" — a
    // restore credential's whole purpose is arriving on a NEW device with no
    // guarantee the old counter travelled with it, so 5 -> 0 is accepted on purpose.
    if (stored.counter > 0 && newCounter > 0 && newCounter <= stored.counter) {
      this.logger.warn(
        `Restore credential ${stored.id} replayed a counter (${newCounter} <= ${stored.counter})`,
      );
      throw new UnauthorizedException('Restore credential failed verification');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedException('Unknown restore credential');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.prisma.restoreCredential.update({
      where: { id: stored.id },
      data: { counter: newCounter, lastUsedAt: new Date() },
    });

    return this.auth.buildAuthResponse(user);
  }

  /**
   * The assertion carries its own challenge inside clientDataJSON. Reading it
   * is not trusting it: it is only a lookup key, and an assertion whose
   * challenge we never issued (or already consumed) finds nothing in Redis.
   */
  private readChallenge(response: AuthenticationResponseJSON): string {
    try {
      const json = Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8');
      const challenge = JSON.parse(json).challenge;
      if (typeof challenge !== 'string' || !challenge) throw new Error('missing challenge');
      return challenge;
    } catch {
      throw new UnauthorizedException('Malformed restore assertion');
    }
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.prisma.restoreCredential.deleteMany({ where: { userId } });
  }
}

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

    // Atomic read+delete, same as the authentication half (see
    // verifyAuthentication below): a failed verification must not leave the
    // challenge sitting in Redis, live and replayable, for the rest of its
    // 300s TTL. Consuming it here — before the verify call, not after a
    // success — closes that window instead of only closing it on the happy path.
    const expectedChallenge = await this.cache.getAndDelete<string>(regKey(userId));
    if (!expectedChallenge) {
      throw new UnauthorizedException('No pending restore-credential registration');
    }

    let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      result = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: config.expectedOrigins,
        expectedRPID: config.rpId,
        requireUserVerification: false,
      });
    } catch (err) {
      // @simplewebauthn/server throws plain Errors (not `{verified: false}`)
      // for structural problems (bad type, corrupted attestation object, …).
      // Log the cause so a genuine library bug stays diagnosable, but never
      // let it escape as an uncaught error — this is a public route and every
      // failure here must be a controlled 401, not a 500.
      this.logger.warn(
        `Restore credential registration verification threw: ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Restore credential failed verification');
    }

    if (!result.verified || !result.registrationInfo) {
      throw new UnauthorizedException('Restore credential failed verification');
    }

    const { credential } = result.registrationInfo;
    await this.upsertCredential(userId, {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
    });

    return { ok: true as const };
  }

  /**
   * Idempotent on `credentialId` (`@unique` in the schema) — the ABA-316
   * "server-side create idempotency" rule from CLAUDE.md. Stage 2 registers a
   * restore credential on launch whenever the device is already signed in
   * behind a local flag, so a lost flag, a reinstall, or a sign-out/sign-in on
   * the same device all re-present the SAME credential id. A bare `create`
   * would throw P2002 on that ordinary retry and surface as an HTTP 500 on a
   * route the client will simply try again. Pre-checking with `findUnique`
   * closes the common case; catching P2002 around the `create` (outside any
   * `$transaction` — there isn't one here, but the race between the
   * pre-check and the insert is real regardless) closes the concurrent one.
   *
   * A credential id that already belongs to a DIFFERENT user is rejected, not
   * reassigned — silently repointing an existing row would let one account
   * take over another account's restore path.
   */
  private async upsertCredential(
    userId: string,
    data: {
      credentialId: string;
      publicKey: Buffer;
      counter: number;
      transports: string[];
    },
  ): Promise<void> {
    const existing = await this.prisma.restoreCredential.findUnique({
      where: { credentialId: data.credentialId },
    });
    if (existing) {
      await this.reconcileExistingCredential(userId, existing, data);
      return;
    }

    try {
      await this.prisma.restoreCredential.create({
        data: { userId, ...data },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const race = await this.prisma.restoreCredential.findUnique({
          where: { credentialId: data.credentialId },
        });
        if (race) {
          await this.reconcileExistingCredential(userId, race, data);
          return;
        }
      }
      throw err;
    }
  }

  private async reconcileExistingCredential(
    userId: string,
    existing: { id: string; userId: string; counter: number },
    data: { publicKey: Buffer; counter: number; transports: string[] },
  ): Promise<void> {
    if (existing.userId !== userId) {
      this.logger.warn(
        `Restore credential ${existing.id} re-registration rejected: already ` +
          `registered to a different account (existing user ${existing.userId}, ` +
          `requesting user ${userId})`,
      );
      throw new UnauthorizedException('Restore credential failed verification');
    }
    // Same high-water-mark rule as verifyAuthentication: this is the
    // idempotent-retry path (lost flag, reinstall, sign-out/sign-in) for a
    // credential that already has a row, and `data.counter` is just-attested
    // FRESH state from the authenticator — for a system-managed restore key
    // that is routinely 0. Writing it verbatim would zero out the stored
    // watermark and permanently disarm the `stored.counter > 0` replay guard
    // in verifyAuthentication for a credential that had already advanced.
    await this.prisma.restoreCredential.update({
      where: { id: existing.id },
      data: {
        publicKey: data.publicKey,
        counter: Math.max(existing.counter, data.counter),
        transports: data.transports,
      },
    });
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
    // Atomic read+delete: a plain get-then-del pair would leave a window in
    // which two concurrent submissions of the same assertion both observe
    // the challenge as present before either deletes it, and both mint a
    // session from one single-use challenge.
    const issued = await this.cache.getAndDelete<string>(authKey(challenge));
    if (!issued) {
      throw new UnauthorizedException('Unknown or expired restore challenge');
    }

    const stored = await this.prisma.restoreCredential.findUnique({
      where: { credentialId: response.id },
    });
    if (!stored) {
      throw new UnauthorizedException('Unknown restore credential');
    }

    let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      result = await verifyAuthenticationResponse({
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
    } catch (err) {
      // @simplewebauthn/server throws plain Errors (not `{verified: false}`)
      // for structural problems beyond what readChallenge already validates
      // (bad type, corrupted authenticatorData, a malformed signature). Log
      // the cause so a genuine library bug stays diagnosable, but never let
      // it escape as an uncaught error — this is a public route and every
      // failure here must be a controlled 401, not a 500.
      this.logger.warn(
        `Restore credential authentication verification threw: ${(err as Error).message}`,
      );
      throw new UnauthorizedException('Restore credential failed verification');
    }

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
    // Restore is the one login path that mints a full session unconditionally
    // (no password, no OTP) — every other path either checks isVerified before
    // issuing tokens (login) or sets it itself (register/verifyEmail/Google),
    // so an unverified account is rejected here as defence in depth, even
    // though nothing today can actually reach this state.
    if (!user.isVerified) {
      throw new UnauthorizedException('Account is not verified');
    }

    // Persist the HIGH-WATER MARK, not the presented count. Accepting a
    // 5 -> 0 login (a system-managed restore key legitimately reporting no
    // count) is deliberate — see the comment above — but persisting that 0 is
    // not: it would zero out `stored.counter`, permanently disarming the
    // `stored.counter > 0` guard above and letting a LATER genuine regression
    // (e.g. 7 -> 4, on the ORIGINAL device, after the restore-device login)
    // sail through unnoticed. The login still succeeds exactly as before;
    // only the stored watermark differs.
    await this.prisma.restoreCredential.update({
      where: { id: stored.id },
      data: { counter: Math.max(stored.counter, newCounter), lastUsedAt: new Date() },
    });

    // lastSyncAt is deliberately NOT stamped here. Unlike login()/googleLogin()
    // — which stamp it explicitly because THEIR request never reaches
    // JwtStrategy — the restored client's very next authenticated request
    // does, and JwtStrategy.validate() stamps it there via LastActiveService
    // (throttled, one write per 15 min). CLAUDE.md's ABA-389 entry explicitly
    // says: "Do not re-add a per-route updateLastSync call."
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

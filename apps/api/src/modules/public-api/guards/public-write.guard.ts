import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PublicApiError } from '../public-api-error';
import type { PublicApiRequest } from '../public-api.types';

/**
 * A tier 1 encrypted account is read-only through the public API: its text fields are ciphertext
 * the server cannot produce, so a third party cannot write them. Tier >= 2 never gets this far
 * (`PublicApiAuthGuard` refuses it outright); the `>= 1` check covers it anyway. Runs after
 * `PublicApiAuthGuard` (method-level guards run after class-level ones), which sets `req.oauth`.
 */
@Injectable()
export class PublicWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Partial<PublicApiRequest>>();
    const tier = req.oauth?.encryptionTier;
    if (tier === undefined) {
      // Misconfiguration (no PublicApiAuthGuard in front) — refuse rather than write unauthenticated.
      throw new PublicApiError(401, 'invalid_token', 'The access token is missing or invalid.');
    }
    if (tier >= 1) {
      throw new PublicApiError(403, 'account_encrypted', 'This account is end-to-end encrypted and is read-only through the API.');
    }
    return true;
  }
}

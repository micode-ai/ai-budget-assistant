import { SetMetadata } from '@nestjs/common';
import type { PublicScope } from '../../oauth/oauth-scopes';

export const REQUIRE_SCOPES_KEY = 'publicApiRequiredScopes';

/**
 * Scopes a `/public/v1` route needs, checked by `PublicApiAuthGuard` against the grant's CURRENT
 * scopes (Ruling 10). Class- and method-level lists are merged: a request needs all of them.
 */
export const RequireScopes = (...scopes: PublicScope[]) => SetMetadata(REQUIRE_SCOPES_KEY, scopes);

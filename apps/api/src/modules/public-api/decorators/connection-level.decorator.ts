import { SetMetadata } from '@nestjs/common';

export const CONNECTION_LEVEL_KEY = 'publicApiConnectionLevel';

/** The request header that addresses one account of a multi-account connection (lower-cased, as Node stores it). */
export const ACCOUNT_HEADER = 'x-account-id';

/**
 * The route answers about the CONNECTION, not one account of it (`GET /public/v1/accounts`):
 * `PublicApiAuthGuard` still checks the token, grant, client, user, scopes and rate limit, but skips
 * `X-Account-Id` resolution and the per-account role/encryption checks. It sets no `req.accountId`,
 * `req.accountRole` or `req.monthAnchorDay`; `req.oauth.grantAccountIds` lists the granted accounts
 * and `req.oauth.encryptionTier` is 0. Never put it on a route that reads or writes account data.
 */
export const ConnectionLevel = () => SetMetadata(CONNECTION_LEVEL_KEY, true);
